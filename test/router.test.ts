import { describe, test, expect } from "bun:test";
import { SentryRouter } from "../src/core/router.core";
import type { Service } from "../src/core/types.core";

const services: Record<string, Service> = {
    root: {
        target: "http://localhost:8001",
        strip_prefix: false,
    },
    api: {
        target: "http://localhost:8002",
        strip_prefix: true,
    },
    chat: {
        target: "http://localhost:3000",
        strip_prefix: true,
        ws_required: true,
    },
};

describe("SentryRouter", () => {
    test("resolves named service by first path segment", () => {
        const result = SentryRouter.resolve("/api/users", services);
        expect(result).not.toBeNull();
        expect(result!.targetUrl).toBe("http://localhost:8002/users");
        expect(result!.serviceName).toBe("api");
    });

    test("strips prefix when strip_prefix is true", () => {
        const result = SentryRouter.resolve("/api/users/123", services);
        expect(result!.targetUrl).toBe("http://localhost:8002/users/123");
    });

    test("preserves prefix when strip_prefix is false", () => {
        // Directly hit root with a sub-path that doesn't match a service
        const result = SentryRouter.resolve("/health", services);
        expect(result).not.toBeNull();
        expect(result!.targetUrl).toBe("http://localhost:8001/health");
    });

    test("falls back to root when service name not found", () => {
        const result = SentryRouter.resolve("/unknown/path", services);
        expect(result).not.toBeNull();
        expect(result!.serviceName).toBe("root");
        expect(result!.targetUrl).toBe("http://localhost:8001/unknown/path");
    });

    test("returns null when no route matches and no root/default exists", () => {
        const noRoot: Record<string, Service> = {
            api: { target: "http://localhost:8002", strip_prefix: true },
        };
        const result = SentryRouter.resolve("/missing", noRoot);
        expect(result).toBeNull();
    });

    test("resolves root path /", () => {
        const result = SentryRouter.resolve("/", services);
        expect(result).not.toBeNull();
        expect(result!.targetUrl).toBe("http://localhost:8001/");
    });

    test("strips trailing slash from target", () => {
        const withSlash: Record<string, Service> = {
            root: { target: "http://localhost:8001/", strip_prefix: false },
        };
        const result = SentryRouter.resolve("/test", withSlash);
        expect(result!.targetUrl).toBe("http://localhost:8001/test");
    });

    test("returns service metadata for ws_required check", () => {
        const result = SentryRouter.resolve("/chat/room/1", services);
        expect(result).not.toBeNull();
        expect(result!.service.ws_required).toBe(true);
    });

    test("strip_prefix produces / when path equals service name", () => {
        const result = SentryRouter.resolve("/api", services);
        expect(result!.targetUrl).toBe("http://localhost:8002/");
    });
});
