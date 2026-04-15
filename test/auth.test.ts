import { describe, test, expect, beforeAll } from "bun:test";
import { SentryAuth } from "../src/middleware/auth.middleware";

const TEST_SECRET = "test-secret-key-for-sentrygate-tests";

/**
 * Generates a signed HMAC-SHA256 JWT for testing.
 */
async function createTestJWT(payload: object, secret = TEST_SECRET): Promise<string> {
    const header = { alg: "HS256", typ: "JWT" };

    const encode = (obj: object) =>
        btoa(JSON.stringify(obj))
            .replace(/=/g, "")
            .replace(/\+/g, "-")
            .replace(/\//g, "_");

    const headerB64 = encode(header);
    const payloadB64 = encode(payload);

    const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
    );

    const signature = await crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode(`${headerB64}.${payloadB64}`)
    );

    const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
        .replace(/=/g, "")
        .replace(/\+/g, "-")
        .replace(/\//g, "_");

    return `${headerB64}.${payloadB64}.${signatureB64}`;
}

describe("SentryAuth", () => {
    beforeAll(async () => {
        process.env.SENTRY_AUTH_SECRET = TEST_SECRET;
        await SentryAuth.init();
    });

    test("reports configured when secret is loaded", () => {
        expect(SentryAuth.isConfigured()).toBe(true);
    });

    test("rejects request with no Authorization header", async () => {
        const req = new Request("http://localhost/test");
        expect(await SentryAuth.isAuthenticated(req)).toBe(false);
    });

    test("rejects non-Bearer auth scheme", async () => {
        const req = new Request("http://localhost/test", {
            headers: { Authorization: "Basic abc123" },
        });
        expect(await SentryAuth.isAuthenticated(req)).toBe(false);
    });

    test("rejects empty Bearer token", async () => {
        const req = new Request("http://localhost/test", {
            headers: { Authorization: "Bearer " },
        });
        expect(await SentryAuth.isAuthenticated(req)).toBe(false);
    });

    test("accepts valid JWT with future expiration", async () => {
        const token = await createTestJWT({
            sub: "user1",
            exp: Math.floor(Date.now() / 1000) + 3600,
        });
        const req = new Request("http://localhost/test", {
            headers: { Authorization: `Bearer ${token}` },
        });
        expect(await SentryAuth.isAuthenticated(req)).toBe(true);
    });

    test("accepts valid JWT with no exp claim", async () => {
        const token = await createTestJWT({ sub: "user1" });
        const req = new Request("http://localhost/test", {
            headers: { Authorization: `Bearer ${token}` },
        });
        expect(await SentryAuth.isAuthenticated(req)).toBe(true);
    });

    test("rejects expired JWT", async () => {
        const token = await createTestJWT({
            sub: "user1",
            exp: Math.floor(Date.now() / 1000) - 3600,
        });
        const req = new Request("http://localhost/test", {
            headers: { Authorization: `Bearer ${token}` },
        });
        expect(await SentryAuth.isAuthenticated(req)).toBe(false);
    });

    test("rejects JWT signed with wrong secret", async () => {
        const token = await createTestJWT({ sub: "user1" }, "wrong-secret");
        const req = new Request("http://localhost/test", {
            headers: { Authorization: `Bearer ${token}` },
        });
        expect(await SentryAuth.isAuthenticated(req)).toBe(false);
    });

    test("rejects malformed JWT (wrong segment count)", async () => {
        const req = new Request("http://localhost/test", {
            headers: { Authorization: "Bearer not.a.valid.jwt.here" },
        });
        expect(await SentryAuth.isAuthenticated(req)).toBe(false);
    });

    test("rejects JWT used before nbf time", async () => {
        const token = await createTestJWT({
            sub: "user1",
            nbf: Math.floor(Date.now() / 1000) + 3600,
        });
        const req = new Request("http://localhost/test", {
            headers: { Authorization: `Bearer ${token}` },
        });
        expect(await SentryAuth.isAuthenticated(req)).toBe(false);
    });

    test("rejects random garbage as token", async () => {
        const req = new Request("http://localhost/test", {
            headers: { Authorization: "Bearer aslkdjflaskdjflaskdjf" },
        });
        expect(await SentryAuth.isAuthenticated(req)).toBe(false);
    });
});
