# SentryGate — Engineering Internals

> A full breakdown of the architecture, design decisions, and performance optimizations behind SentryGate.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Rate Limiting](#rate-limiting)
- [Request Pipeline](#request-pipeline)
- [Memory Management](#memory-management)
- [Logging](#logging)
- [WebSocket Support](#websocket-support)
- [TLS / SSL](#tls--ssl)
- [Performance Decisions](#performance-decisions)
- [Honest Performance Comparison vs Nginx](#honest-performance-comparison-vs-nginx)
- [Known Architectural Limits](#known-architectural-limits)
- [File Reference](#file-reference)

---

## Overview

SentryGate is a reverse proxy / API gateway compiled to a standalone binary using Bun. It handles HTTP and WebSocket proxying, token-bucket rate limiting, bearer auth, header shielding, and structured logging — with zero external runtime dependencies.

```
Client → SentryGate Binary → Upstream Services
```

The binary is compiled via:

```bash
bun build ./src/index.ts --compile --outfile sentrygate
```

This produces a self-contained executable. No Bun, Node.js, or runtime installation required on the target machine.

---

## Architecture

```
src/
├── core/
│   ├── engine.core.ts        # Main server, request lifecycle
│   ├── router.core.ts        # Path-based service resolution
│   └── types.core.ts         # All shared interfaces
├── middleware/
│   ├── auth.middleware.ts     # Bearer token auth
│   ├── logger.middleware.ts   # Console + file logging
│   └── rlimits.middleware.ts  # Token bucket rate limiter + LRU map
└── utils/
    ├── header-tool.utils.ts   # Header shielding
    └── loader.utils.ts        # TOML config loader
```

### Request Flow

```
Incoming Request
      │
      ▼
 Rate Limit Check (cheapest — before any allocation)
      │
      ├─ BLOCKED → return pre-allocated 429 (zero allocation)
      │
      ▼
 Parse URL
      │
      ▼
 WebSocket Upgrade Check
      │
      ├─ UPGRADE → resolve route → server.upgrade() → return undefined
      │
      ▼
 /sentry-status check
      │
      ├─ MATCH → return JSON status
      │
      ▼
 Route Resolution
      │
      ├─ NOT FOUND → return pre-allocated 404
      │
      ▼
 Auth Check (if route requires it)
      │
      ├─ UNAUTHORIZED → return pre-allocated 401
      │
      ▼
 Proxy Request to Upstream
      │
      ├─ ERROR → return pre-allocated 502 + log
      │
      ▼
 Shield Response Headers → return proxied Response
```

---

## Rate Limiting

### Algorithm: Token Bucket

SentryGate uses a **token bucket** algorithm, the same algorithm used by Nginx's `ngx_http_limit_req_module`.

**Why not fixed window?**

Fixed window counters have a boundary exploit. A client can send 2x the limit in 2 seconds by hitting the end of one window and the start of the next:

```
Window 1 end   → 60 requests at 00:59
Window 2 start → 60 requests at 01:00
= 120 requests in 2 seconds. Never caught.
```

Token bucket prevents this by refilling continuously at a fixed rate rather than resetting a counter.

### How It Works

Each IP gets a "bucket" with a maximum token capacity. Each request consumes one token. Tokens refill at a fixed rate per second. When the bucket is empty, the request is rejected.

```
CAPACITY   = 60 tokens   (max burst)
REFILL     = 1 token/sec (sustained rate = 60 req/min)
```

A client can burst up to 60 requests instantly, but then must wait for tokens to refill. There is no window boundary to exploit.

### Implementation

```typescript
static isSpamming(ip: string, capacity = SentryRateLimiter.CAPACITY): boolean {
    const now = Date.now();
    const bucket = this.buckets.get(ip);

    if (!bucket) {
        this.buckets.set(ip, { tokens: capacity - 1, lastRefill: now });
        return false;
    }

    const elapsed = (now - bucket.lastRefill) / 1000;
    bucket.tokens = Math.min(capacity, bucket.tokens + elapsed * REFILL_RATE);
    bucket.lastRefill = now;

    if (bucket.tokens < 1) return true;

    bucket.tokens--;
    return false;
}
```

### Nginx Mapping

| Nginx Config | SentryGate Equivalent |
|---|---|
| `rate=60r/m` | `REFILL_RATE = 1` token/sec |
| `burst=20` | `capacity` parameter |
| `zone=x:10m` | `LRUBucketMap(100_000)` |
| `nodelay` | Tokens consumed immediately |

---

## Memory Management

### Problem: Unbounded Map Growth

A naive Map-based rate limiter grows forever. Under a DDoS with randomized spoofed IPs, the Map consumes all available memory and crashes the process. Nginx solves this with a hard memory zone cap (`zone=x:10m`).

### Solution: LRU-Capped Bucket Map

SentryGate uses a custom `LRUBucketMap` with a hard entry cap of 100,000 IPs. When the cap is reached, the least recently used entry is evicted — the same eviction strategy used by Nginx's shared memory zone.

```typescript
class LRUBucketMap {
    private map = new Map<string, { tokens: number; lastRefill: number }>();
    private readonly maxSize: number;

    get(ip: string) {
        const entry = this.map.get(ip);
        if (!entry) return undefined;
        // Promote to most-recently-used by re-inserting at end
        this.map.delete(ip);
        this.map.set(ip, entry);
        return entry;
    }

    set(ip: string, value: { tokens: number; lastRefill: number }) {
        if (this.map.has(ip)) this.map.delete(ip);
        else if (this.map.size >= this.maxSize) {
            // Evict LRU (first key in Map = oldest insertion)
            this.map.delete(this.map.keys().next().value!);
        }
        this.map.set(ip, value);
    }
}
```

This works because JavaScript's `Map` preserves insertion order. The first key is always the oldest. JS Map operations (`get`, `set`, `delete`) are all O(1).

### Cleanup Interval

In addition to LRU eviction, a background interval runs every 2 minutes and evicts buckets that would be full by now — meaning the IP has been idle long enough that their tokens have fully refilled. There is no reason to keep their record.

```typescript
setInterval(() => {
    const now = Date.now();
    for (const [ip, bucket] of SentryRateLimiter.buckets.entries()) {
        const elapsed = (now - bucket.lastRefill) / 1000;
        const projected = bucket.tokens + elapsed * REFILL_RATE;
        if (projected >= CAPACITY) {
            SentryRateLimiter.buckets.delete(ip);
        }
    }
}, 120_000).unref(); // .unref() prevents this from blocking process exit
```

The cleanup interval is set to `2 × windowMs` (2 minutes for a 1-minute effective window). This guarantees every entry touched is actually stale, without holding dead entries longer than necessary.

---

## Request Pipeline

### Pre-Allocated Static Responses

Rejection responses (429, 404, 401, 502) are allocated **once at class load time**, not per request. Under high rejection load (e.g. DDoS), this eliminates thousands of object allocations per second.

```typescript
private static readonly RES_429 = new Response("🛡️ SentryGate: Too Many Requests", { status: 429 });
private static readonly RES_404 = new Response("🛡️ SentryGate: Not Found", { status: 404 });
private static readonly RES_401 = new Response("🛡️ SentryGate: Unauthorized", { status: 401 });
private static readonly RES_502 = new Response("🛡️ SentryGate: Backend Unreachable", { status: 502 });
```

`Response` objects in the Fetch API spec are immutable. Returning the same instance across requests is safe.

Proxied responses cannot be pre-allocated as they carry dynamic bodies.

### Rate Limit Before URL Parsing

`new URL(req.url)` is not free — it allocates a URL object and parses the full string. There is no reason to do this for a request you are about to reject. The rate limit check runs first, before any allocation.

```typescript
// Rate limit — cheapest possible check
if (base.default_rate_limit && SentryRateLimiter.isSpamming(remoteIp)) {
    return SentryGate.RES_429; // zero allocation, pre-built
}

// Only reach here if request is allowed through
const url = new URL(req.url);
```

### No `async/await` on the Fetch Handler

The `fetch` handler in `Bun.serve` does not need to be `async`. Wrapping it in `async` adds an extra Promise microtask allocation per request. Since `handleRequest` already returns a `Promise<Response>`, we return it directly:

```typescript
// Bad — unnecessary async wrapper
fetch: async (req, server) => {
    return await this.handleRequest(req, ip, server);
}

// Good — zero extra allocation
fetch: (req, server) => {
    return this.handleRequest(req, ip, server);
}
```

### Header Shielding

`HeaderTool.shield()` strips backend-identifying headers and injects gateway identity on both the request (outbound to upstream) and the response (returned to client).

```typescript
// Strips
"Server"
"X-Powered-By"

// Injects
"X-Sentry-Processed": gateName
"X-Sentry-ID": requestId  // UUID v7 — time-sortable, unique per request
```

---

## Logging

### File Append Fix

The original implementation used `Bun.write()` with an `append` option cast via `as any`. `Bun.write` does not support appending — the cast hid a type error that caused every log write to overwrite the file instead of appending. This was fixed by using Node's `appendFile` which Bun supports natively:

```typescript
import { appendFile } from "node:fs/promises";

await appendFile(this.logPath, line);
```

### Log Format

Each request produces a structured JSON line in `sentrygate.log`:

```json
{
  "timestamp": "2026-04-15T12:00:00.000Z",
  "id": "019123ab-...",
  "method": "GET",
  "path": "/api/users",
  "status": 200,
  "duration": "12.34ms"
}
```

### Status Icon Tiers

```
✅  2xx / 3xx — success
❌  4xx       — client error
🔴  5xx       — server error
```

5xx and 4xx are different problems. Treating them the same icon hides server-side failures in noisy logs.

### Error Logging on 502

502 errors from upstream failures are logged via the same logger rather than silently swallowed:

```typescript
} catch (error) {
    if (base.logging) SentryLogger.logRequest(requestId, req.method, url.pathname, 502, "0");
    return SentryGate.RES_502;
}
```

---

## WebSocket Support

SentryGate supports WebSocket (`ws://`) and Secure WebSocket (`wss://`) proxying.

When an upgrade header is detected, the route is resolved and the connection is upgraded via Bun's native `server.upgrade()`. The request data (target URL, request ID, path) is attached to the WebSocket context for downstream use.

```typescript
if (req.headers.get("upgrade")?.toLowerCase() === "websocket") {
    const route = SentryRouter.resolve(url.pathname, services);
    if (route) {
        const upgraded = server.upgrade(req, {
            data: {
                target: route.targetUrl,
                requestId: randomUUIDv7(),
                path: url.pathname
            }
        });
        if (upgraded) return undefined;
    }
}
```

Returning `undefined` from the fetch handler signals to Bun that the connection has been handed off to the WebSocket handler.

---

## TLS / SSL

TLS is configured via `sentrygate.toml`. When `ssl_enabled = true`, SentryGate reads the cert and key files via `Bun.file()` and passes them to Bun's native TLS layer.

```toml
[server]
ssl_enabled = true
cert_path = "/etc/ssl/certs/server.crt"
key_path  = "/etc/ssl/private/server.key"
```

When `ssl_enabled = false`, the `tls` field is `undefined` and Bun skips TLS entirely.

---

## Performance Decisions

| Decision | Reason |
|---|---|
| Token bucket over fixed window | Eliminates boundary exploit, matches Nginx algorithm |
| LRU map with hard cap | Prevents unbounded memory growth under spoofed IP floods |
| Rate limit before URL parse | Avoids allocations for rejected requests |
| Pre-allocated error responses | Zero allocation per rejection |
| No `async/await` on fetch handler | Removes redundant Promise wrapper per request |
| `appendFile` over `Bun.write` | `Bun.write` does not support append; `as any` was hiding a silent bug |
| `randomUUIDv7` | Time-sortable UUID — logs are naturally ordered without a sort step |
| `.unref()` on cleanup interval | Prevents the cleanup timer from keeping the process alive after shutdown |
| Compiled to binary | Eliminates runtime interpretation overhead entirely |

---

## Honest Performance Comparison vs Nginx

| | Nginx | SentryGate |
|---|---|---|
| Rate limit algorithm | Token bucket | Token bucket ✅ |
| Execution speed | C native | Bun binary — comparable ✅ |
| Memory cap | Hard zone limit | LRU hard cap ✅ |
| Multi-instance shared state | OS shared memory across workers | ❌ Isolated per process |
| Request rejection layer | Network / kernel | Application layer ❌ |

**What this means in practice:**

SentryGate closes every gap that is solvable in userspace. The two remaining gaps are not language problems — they are architectural constraints of any userspace HTTP server:

**Multi-instance isolation** — Nginx uses OS-level shared memory segments with mutex locks across worker processes. A userspace process cannot share a Map across OS process boundaries without an IPC layer (Redis, Unix socket, shared memory file). SentryGate is designed as a single binary. Running two instances means two independent rate limiters. If multi-instance deployment is required, put a Redis coordinator in front.

**Rejection layer** — Nginx can reject requests before the TCP connection is fully accepted at the kernel level. Any userspace server — Bun, Go, Rust — must accept the TCP connection before it can inspect the HTTP request. The cost is inherent to userspace HTTP. SentryGate minimizes this cost (zero allocation on rejection, check first before any parsing) but cannot eliminate it.

For single-instance deployments at moderate to high traffic, SentryGate is on par with Nginx. For multi-instance clustered deployments under DDoS conditions, Nginx's architecture has structural advantages that cannot be replicated without external infrastructure.

---

## File Reference

| File | Responsibility |
|---|---|
| `src/core/engine.core.ts` | Server bootstrap, request lifecycle, WebSocket handling |
| `src/core/router.core.ts` | Resolves URL pathnames to upstream service targets |
| `src/core/types.core.ts` | `SentryGateConfig`, `ServerConfig`, `BaseConfig`, `Service` interfaces |
| `src/middleware/auth.middleware.ts` | Bearer token validation |
| `src/middleware/logger.middleware.ts` | Structured console + file logging |
| `src/middleware/rlimits.middleware.ts` | `LRUBucketMap` + token bucket rate limiter |
| `src/utils/header-tool.utils.ts` | Header masking and gateway identity injection |
| `src/utils/loader.utils.ts` | TOML config file loader |

---

*MIT © 2026 Victor Chibuogwu Chukwuemeka*