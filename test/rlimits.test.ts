import { describe, test, expect } from "bun:test";
import { SentryRateLimiter } from "../src/middleware/rlimits.middleware";

describe("SentryRateLimiter", () => {
    test("allows first request from a new IP", () => {
        expect(SentryRateLimiter.isSpamming("rl-new-ip")).toBe(false);
    });

    test("allows requests within default capacity (60)", () => {
        const ip = "rl-within-cap";
        // First call creates bucket with capacity-1 = 59 tokens
        // Next 58 calls consume tokens 59→1
        // Total: 59 allowed calls (first + 58)
        for (let i = 0; i < 59; i++) {
            expect(SentryRateLimiter.isSpamming(ip)).toBe(false);
        }
    });

    test("blocks after default capacity is exhausted", () => {
        const ip = "rl-exhaust";
        // 60 requests consume all tokens
        for (let i = 0; i < 60; i++) {
            SentryRateLimiter.isSpamming(ip);
        }
        expect(SentryRateLimiter.isSpamming(ip)).toBe(true);
    });

    test("blocks persist until tokens refill", () => {
        const ip = "rl-persist";
        for (let i = 0; i < 60; i++) {
            SentryRateLimiter.isSpamming(ip);
        }
        // Still blocked immediately after
        expect(SentryRateLimiter.isSpamming(ip)).toBe(true);
        expect(SentryRateLimiter.isSpamming(ip)).toBe(true);
    });

    test("respects custom capacity", () => {
        const ip = "rl-custom-cap";
        for (let i = 0; i < 3; i++) {
            SentryRateLimiter.isSpamming(ip, 3, "small-service");
        }
        expect(SentryRateLimiter.isSpamming(ip, 3, "small-service")).toBe(true);
    });

    test("per-service buckets are independent", () => {
        const ip = "rl-svc-independent";

        // Exhaust serviceA with capacity 5
        for (let i = 0; i < 5; i++) {
            SentryRateLimiter.isSpamming(ip, 5, "serviceA");
        }
        expect(SentryRateLimiter.isSpamming(ip, 5, "serviceA")).toBe(true);

        // serviceB should still be open
        expect(SentryRateLimiter.isSpamming(ip, 5, "serviceB")).toBe(false);
    });

    test("global and per-service buckets are independent", () => {
        const ip = "rl-global-vs-svc";

        // Exhaust global bucket
        for (let i = 0; i < 60; i++) {
            SentryRateLimiter.isSpamming(ip);
        }
        expect(SentryRateLimiter.isSpamming(ip)).toBe(true);

        // Per-service bucket for same IP should still work
        expect(SentryRateLimiter.isSpamming(ip, 60, "separate-service")).toBe(false);
    });
});
