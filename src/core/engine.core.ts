import { randomUUIDv7 } from "bun";
import type { SentryGateConfig, WSData } from "./types.core";
import { SentryRouter } from "./router.core";
import { SentryAuth } from "../middleware/auth.middleware";
import { SentryLogger } from "../middleware/logger.middleware";
import { HeaderTool } from "../utils/header-tool.utils";
import { SentryRateLimiter } from "../middleware/rlimits.middleware";

export class SentryGate {
    private requestCount = 0;

    // Response factories — one fresh Response per rejection.
    // Response bodies are streams that can only be consumed once,
    // so sharing a static instance across requests is unsafe.
    private static res429() { return new Response("🛡️ SentryGate: Too Many Requests", { status: 429 }); }
    private static res404() { return new Response("🛡️ SentryGate: Not Found", { status: 404 }); }
    private static res401() { return new Response("🛡️ SentryGate: Unauthorized", { status: 401 }); }
    private static res502() { return new Response("🛡️ SentryGate: Backend Unreachable", { status: 502 }); }
    private static res504() { return new Response("🛡️ SentryGate: Upstream Timeout", { status: 504 }); }

    constructor(private config: SentryGateConfig) {}

    public start() {
        const { port, name } = this.config.server;
        console.log(`\n🛡️  SentryGate "${name}" standing guard on port ${port}`);

        const server = Bun.serve<WSData>({
            port,
            fetch: (req, server) => {
                const ip = server.requestIP(req)?.address || "127.0.0.1";
                return this.handleRequest(req, ip, server);
            },
            websocket: {
                open(ws) {
                    try {
                        const { target } = ws.data;
                        // Convert http(s):// to ws(s):// for the upstream connection
                        const wsTarget = target.replace(/^http/, "ws");
                        const upstream = new WebSocket(wsTarget);
                        ws.data.upstream = upstream;

                        upstream.onopen = () => {
                            console.log(`🛡️ SentryGate: WebSocket upstream connected → ${wsTarget}`);
                        };

                        upstream.onmessage = (event) => {
                            ws.send(event.data);
                        };

                        upstream.onclose = () => {
                            ws.close();
                        };

                        upstream.onerror = () => {
                            console.error(`🛡️ SentryGate: WebSocket upstream error → ${wsTarget}`);
                            ws.close();
                        };
                    } catch {
                        ws.close();
                    }
                },
                message(ws, message) {
                    const upstream = ws.data.upstream;
                    if (upstream && upstream.readyState === WebSocket.OPEN) {
                        upstream.send(message);
                    }
                },
                close(ws) {
                    const upstream = ws.data.upstream;
                    if (upstream && upstream.readyState !== WebSocket.CLOSED) {
                        upstream.close();
                    }
                },
            },
            tls: this.config.server.ssl_enabled
                ? {
                    cert: Bun.file(this.config.server.cert_path || ""),
                    key: Bun.file(this.config.server.key_path || ""),
                }
                : undefined,
        });

        return server;
    }

    private async handleRequest(req: Request, remoteIp: string, server: any): Promise<Response | undefined> {
        const { base, server: serverConfig, services } = this.config;

        // Global rate limit — before any allocation
        if (base.default_rate_limit && SentryRateLimiter.isSpamming(remoteIp)) {
            return SentryGate.res429();
        }

        const url = new URL(req.url);

        // WebSocket upgrade — only for routes that opt in with ws_required
        if (req.headers.get("upgrade")?.toLowerCase() === "websocket") {
            const route = SentryRouter.resolve(url.pathname, services);
            if (route && route.service.ws_required) {
                const upgraded = server.upgrade(req, {
                    data: {
                        target: route.targetUrl + url.search,
                        requestId: randomUUIDv7(),
                        path: url.pathname,
                    },
                });
                if (upgraded) return undefined;
            }
        }

        // Status endpoint
        if (url.pathname === "/sentry-status") {
            return Response.json({
                gate: serverConfig.name,
                status: "active",
                total_handled: this.requestCount,
            });
        }

        // HTTP proxy
        const requestId = randomUUIDv7();
        const startTime = performance.now();
        this.requestCount++;

        const route = SentryRouter.resolve(url.pathname, services);
        if (!route) return SentryGate.res404();

        // Per-service rate limit (runs after routing so we know which service)
        if (base.custom_rate_limit && route.service.rate_limit) {
            if (SentryRateLimiter.isSpamming(remoteIp, route.service.rate_limit, route.serviceName)) {
                return SentryGate.res429();
            }
        }

        // Auth — real JWT verification
        if (route.service.auth_required) {
            if (!SentryAuth.isConfigured()) {
                console.error("🛡️ SentryGate: auth_required=true but SENTRY_AUTH_SECRET is not set");
                return SentryGate.res502();
            }
            if (!(await SentryAuth.isAuthenticated(req))) {
                return SentryGate.res401();
            }
        }

        // Build proxy request
        const proxyReq = new Request(route.targetUrl + url.search, {
            method: req.method,
            headers: HeaderTool.shield(req.headers, serverConfig.name, requestId),
            body: req.body,
            duplex: "half",
        });

        // Execute with timeout
        try {
            const timeoutMs = route.service.timeout_ms || 30_000;
            const response = await fetch(proxyReq, {
                signal: AbortSignal.timeout(timeoutMs),
            });
            const duration = (performance.now() - startTime).toFixed(2);

            if (base.logging) {
                SentryLogger.logRequest(requestId, req.method, url.pathname, response.status, duration);
            }

            return new Response(response.body, {
                status: response.status,
                headers: HeaderTool.shield(response.headers, serverConfig.name, requestId),
            });
        } catch (error: any) {
            const duration = (performance.now() - startTime).toFixed(2);
            const isTimeout = error?.name === "TimeoutError" || error?.name === "AbortError";
            const status = isTimeout ? 504 : 502;

            if (base.logging) {
                SentryLogger.logRequest(requestId, req.method, url.pathname, status, duration);
            }

            return isTimeout ? SentryGate.res504() : SentryGate.res502();
        }
    }
}