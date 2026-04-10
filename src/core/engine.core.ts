import { randomUUIDv7 } from "bun";
import type { SentryGateConfig } from "./types.core";

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

        // Arrow function captures 'this' correctly
        return Bun.serve({
            port: port,
            fetch: async (req) => {
                return await this.handleRequest(req);
            },
            tls: this.config.server.ssl_enabled ? {
                cert: Bun.file(this.config.server.cert_path || ""),
                key: Bun.file(this.config.server.key_path || ""),
            } : undefined
        });
    }

    /**
     * The Logic: Processes, Shields, and Proxies
     */
    private async handleRequest(req: Request): Promise<Response> {
        this.requestCount++;
        const url = new URL(req.url);
        const startTime = performance.now();

        // 1. Internal Health Check (Pillar: Simplicity)
        if (url.pathname === "/sentry-status") {
            return Response.json({
                gate: this.config.server.name,
                status: "active",
                uptime: `${Math.floor((Date.now() - this.startTime) / 1000)}s`,
                total_handled: this.requestCount
            });
        }

        const pathParts = url.pathname.split("/");
        const serviceName = pathParts[1];

        if (!serviceName || !this.config.services) {
            return new Response("🛡️ SentryGate: Not Found", { status: 404 });
        }

        const service = this.config.services[serviceName];

        if (!service) {
            return new Response("🛡️ SentryGate: Route Not Found", { status: 404 });
        }

        if (!service) {
            return new Response("🛡️ SentryGate: Route Not Found", { status: 404 });
        }

        // 3. Security: Auth Shielding
        if (service.auth_required) {
            const auth = req.headers.get("Authorization");
            if (!auth) return new Response("🛡️ SentryGate: Missing Authorization", { status: 401 });
        }

        // 4. Traceability: Correlation IDs
        const requestId = randomUUIDv7();

        // 5. Path Management: Stripping logic
        const finalPath = service.strip_prefix
            ? url.pathname.replace(`/${serviceName}`, "") || "/"
            : url.pathname;

        const targetUrl = service.target.replace(/\/$/, "") + finalPath + url.search;

        // 6. The Proxy Operation (Pillar: Performance)
        const proxyReq = new Request(targetUrl, {
            method: req.method,
            headers: new Headers(req.headers),
            body: req.body, // Pipes the stream directly
            // @ts-ignore - Duplex is required for streaming in Fetch API
            duplex: "half",
        });

        // Identity Masking
        proxyReq.headers.set("X-Sentry-ID", requestId);
        proxyReq.headers.delete("Host");

        try {
            const response = await fetch(proxyReq);

            // Reconstruct response with masked headers
            const gatewayRes = new Response(response.body, response);
            const duration = (performance.now() - startTime).toFixed(2);

            // Log the "Action"
            console.log(`[${requestId}] ${req.method} -> ${serviceName} (${duration}ms)`);

            // Security: Shield the backend's identity from the user
            gatewayRes.headers.set("X-Sentry-Processed", this.config.server.name);
            gatewayRes.headers.delete("Server");
            gatewayRes.headers.delete("X-Powered-By");

            return gatewayRes;
        } catch (error) {
            console.error(`❌ Proxy Error: ${error}`);
            return new Response("🛡️ SentryGate: Backend Unreachable", { status: 502 });
        }
    }
}