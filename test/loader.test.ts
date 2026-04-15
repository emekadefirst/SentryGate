import { describe, test, expect } from "bun:test";
import { validateConfig } from "../src/utils/loader.utils";

const validConfig = {
    base: {
        logging: true,
        default_rate_limit: true,
        custom_rate_limit: false,
    },
    server: {
        port: 8080,
        name: "test-gate",
    },
    services: {
        root: {
            target: "http://localhost:3000",
            strip_prefix: false,
        },
    },
};

/** Deep-clone helper to avoid mutation between tests */
function clone(obj: any): any {
    return JSON.parse(JSON.stringify(obj));
}

describe("Config Validation", () => {
    test("accepts a valid minimal config", () => {
        expect(() => validateConfig(clone(validConfig))).not.toThrow();
    });

    test("returns the config object on success", () => {
        const result = validateConfig(clone(validConfig));
        expect(result.server.port).toBe(8080);
    });

    // ── [base] ──────────────────────────────────────

    test("rejects missing [base] section", () => {
        const cfg = clone(validConfig);
        delete cfg.base;
        expect(() => validateConfig(cfg)).toThrow("Missing [base]");
    });

    test("rejects non-boolean logging", () => {
        const cfg = clone(validConfig);
        cfg.base.logging = "yes";
        expect(() => validateConfig(cfg)).toThrow("logging");
    });

    test("rejects non-boolean default_rate_limit", () => {
        const cfg = clone(validConfig);
        cfg.base.default_rate_limit = 1;
        expect(() => validateConfig(cfg)).toThrow("default_rate_limit");
    });

    test("rejects non-boolean custom_rate_limit", () => {
        const cfg = clone(validConfig);
        cfg.base.custom_rate_limit = "false";
        expect(() => validateConfig(cfg)).toThrow("custom_rate_limit");
    });

    // ── [server] ────────────────────────────────────

    test("rejects missing [server] section", () => {
        const cfg = clone(validConfig);
        delete cfg.server;
        expect(() => validateConfig(cfg)).toThrow("Missing [server]");
    });

    test("rejects port = 0", () => {
        const cfg = clone(validConfig);
        cfg.server.port = 0;
        expect(() => validateConfig(cfg)).toThrow("port");
    });

    test("rejects port > 65535", () => {
        const cfg = clone(validConfig);
        cfg.server.port = 99999;
        expect(() => validateConfig(cfg)).toThrow("port");
    });

    test("rejects non-numeric port", () => {
        const cfg = clone(validConfig);
        cfg.server.port = "80";
        expect(() => validateConfig(cfg)).toThrow("port");
    });

    test("rejects empty server name", () => {
        const cfg = clone(validConfig);
        cfg.server.name = "";
        expect(() => validateConfig(cfg)).toThrow("name");
    });

    test("rejects ssl_enabled without cert_path", () => {
        const cfg = clone(validConfig);
        cfg.server.ssl_enabled = true;
        expect(() => validateConfig(cfg)).toThrow("cert_path");
    });

    test("rejects ssl_enabled without key_path", () => {
        const cfg = clone(validConfig);
        cfg.server.ssl_enabled = true;
        cfg.server.cert_path = "/path/to/cert";
        expect(() => validateConfig(cfg)).toThrow("key_path");
    });

    test("accepts ssl_enabled with both cert_path and key_path", () => {
        const cfg = clone(validConfig);
        cfg.server.ssl_enabled = true;
        cfg.server.cert_path = "/path/to/cert";
        cfg.server.key_path = "/path/to/key";
        expect(() => validateConfig(cfg)).not.toThrow();
    });

    // ── [services] ──────────────────────────────────

    test("rejects missing services", () => {
        const cfg = clone(validConfig);
        delete cfg.services;
        expect(() => validateConfig(cfg)).toThrow("At least one [services.*]");
    });

    test("rejects empty services object", () => {
        const cfg = clone(validConfig);
        cfg.services = {};
        expect(() => validateConfig(cfg)).toThrow("At least one [services.*]");
    });

    test("rejects service with missing target", () => {
        const cfg = clone(validConfig);
        cfg.services = { root: { strip_prefix: false } };
        expect(() => validateConfig(cfg)).toThrow("target");
    });

    test("rejects service with empty target", () => {
        const cfg = clone(validConfig);
        cfg.services = { root: { target: "", strip_prefix: false } };
        expect(() => validateConfig(cfg)).toThrow("target");
    });

    test("rejects service with missing strip_prefix", () => {
        const cfg = clone(validConfig);
        cfg.services = { root: { target: "http://localhost:3000" } };
        expect(() => validateConfig(cfg)).toThrow("strip_prefix");
    });

    test("rejects negative timeout_ms", () => {
        const cfg = clone(validConfig);
        cfg.services.root.timeout_ms = -1;
        expect(() => validateConfig(cfg)).toThrow("timeout_ms");
    });

    test("rejects zero timeout_ms", () => {
        const cfg = clone(validConfig);
        cfg.services.root.timeout_ms = 0;
        expect(() => validateConfig(cfg)).toThrow("timeout_ms");
    });

    test("accepts valid timeout_ms", () => {
        const cfg = clone(validConfig);
        cfg.services.root.timeout_ms = 5000;
        expect(() => validateConfig(cfg)).not.toThrow();
    });

    test("rejects zero rate_limit", () => {
        const cfg = clone(validConfig);
        cfg.services.root.rate_limit = 0;
        expect(() => validateConfig(cfg)).toThrow("rate_limit");
    });

    test("accepts valid rate_limit", () => {
        const cfg = clone(validConfig);
        cfg.services.root.rate_limit = 100;
        expect(() => validateConfig(cfg)).not.toThrow();
    });
});
