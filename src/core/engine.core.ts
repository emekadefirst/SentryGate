import { randomUUIDv7 } from "bun";
import type { SentryGateConfig } from "./types.core";
import { SentryRouter } from "./router.core";
import { SentryAuth } from "../middleware/auth.middleware";
import { SentryLogger } from "../middleware/logger.middleware";
import { HeaderTool } from "../utils/header-tool.utils";
import { SentryRateLimiter } from "../middleware/rlimits.middleware";

export class SentryGate {
    private requestCount = 0;
    private startTime = Date.now();

    constructor(private config: SentryGateConfig) { }

    /**
     * The Heartbeat: Starts the Bun server instance
     */
    public start() {
        const { port, name } = this.config.server;

        console.log(`\n🛡️  SentryGate "${name}" standing guard on port ${port}`);

        return Bun.serve({
            port: port,
            fetch: async (req, server) => {
                // Correct way to get IP in Bun
                const ip = server.requestIP(req)?.address || "127.0.0.1";
                return await this.handleRequest(req, ip);
            },
            tls: this.config.server.ssl_enabled ? {
                cert: Bun.file(this.config.server.cert_path || ""),
                key: Bun.file(this.config.server.key_path || ""),
            } : undefined
        });
    }

    /**
     * The Logic: Orchestrates the modular workflow
     */
    private async handleRequest(req: Request, remoteIp: string): Promise<Response> {
        const { base, server, services } = this.config;
        const startTime = performance.now();
        const url = new URL(req.url);
        const requestId = randomUUIDv7();

        // 1. Rate Limiting Check
        if (base.default_rate_limit) {
            const limit = base.custom_rate_limit ? 100 : 60;
            if (SentryRateLimiter.isSpamming(remoteIp, limit)) {
                return new Response("🛡️ SentryGate: Too Many Requests", { status: 429 });
            }
        }

        // 2. Status Route
        if (url.pathname === "/sentry-status") {
            return Response.json({
                gate: server.name,
                status: "active",
                total_handled: this.requestCount
            });
        }

        // 3. Resolve Route
        const route = SentryRouter.resolve(url.pathname, services);
        if (!route) return new Response("🛡️ SentryGate: Not Found", { status: 404 });

        // 4. Auth Shield
        if (route.service.auth_required && !SentryAuth.isAuthenticated(req)) {
            return new Response("🛡️ SentryGate: Unauthorized", { status: 401 });
        }

        // --- PROXY PREPARATION ---
        const targetUrl = route.targetUrl + url.search;
        const shieldedHeaders = HeaderTool.shield(req.headers, server.name, requestId);

        // We define proxyReq HERE, so it is available to the try block below
        const proxyReq = new Request(targetUrl, {
            method: req.method,
            headers: shieldedHeaders,
            body: req.body,
            // @ts-ignore - Required for streaming bodies in Bun/Fetch
            duplex: "half",
        });

        try {
            const response = await fetch(proxyReq);
            const duration = (performance.now() - startTime).toFixed(2);

            if (base.logging) {
                SentryLogger.logRequest(requestId, req.method, url.pathname, response.status, duration);
            }

            // Prepare the shielded headers first
            const finalHeaders = HeaderTool.shield(response.headers, server.name, requestId);

            // FIX: Pass an object containing the headers, not just the headers themselves
            const gatewayRes = new Response(response.body, {
                status: response.status,
                statusText: response.statusText,
                headers: finalHeaders
            });

            return gatewayRes;

        } catch (error) {
            return new Response("🛡️ SentryGate: Backend Unreachable", { status: 502 });
        }
    }
}