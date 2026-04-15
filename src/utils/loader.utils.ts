import type { SentryGateConfig } from "../core/types.core";
import { join, resolve } from "node:path";

/**
 * Loads and validates the SentryGate config file.
 * @param configPath  Optional absolute or relative path to the TOML file.
 *                    Defaults to ./sentrygate.toml in the current working directory.
 */
export async function loadSentryConfig(configPath?: string): Promise<SentryGateConfig> {
    const resolvedPath = configPath
        ? resolve(configPath)
        : join(process.cwd(), "sentrygate.toml");

    const file = Bun.file(resolvedPath);

    if (!(await file.exists())) {
        throw new Error(
            `🛡️ SentryGate: Configuration file not found at ${resolvedPath}\n` +
            `   Run "sentrygate init" to generate a starter config, or use --config to specify a path.`
        );
    }

    try {
        const content = await file.text();
        const raw = Bun.TOML.parse(content);
        return validateConfig(raw);
    } catch (err: any) {
        throw new Error(`🛡️ SentryGate: ${err.message}`);
    }
}

/**
 * Validates a parsed TOML config object against the SentryGateConfig schema.
 * Throws with a descriptive message on the first invalid field.
 */
export function validateConfig(raw: any): SentryGateConfig {
    // ── [base] ───────────────────────────────────────────────
    if (!raw.base || typeof raw.base !== "object") {
        throw new Error("Missing [base] section in config");
    }
    if (typeof raw.base.logging !== "boolean") {
        throw new Error("[base] logging must be a boolean");
    }
    if (typeof raw.base.default_rate_limit !== "boolean") {
        throw new Error("[base] default_rate_limit must be a boolean");
    }
    if (typeof raw.base.custom_rate_limit !== "boolean") {
        throw new Error("[base] custom_rate_limit must be a boolean");
    }

    // ── [server] ─────────────────────────────────────────────
    if (!raw.server || typeof raw.server !== "object") {
        throw new Error("Missing [server] section in config");
    }
    if (typeof raw.server.port !== "number" || raw.server.port < 1 || raw.server.port > 65535) {
        throw new Error("[server] port must be a number between 1 and 65535");
    }
    if (typeof raw.server.name !== "string" || raw.server.name.length === 0) {
        throw new Error("[server] name must be a non-empty string");
    }
    if (raw.server.ssl_enabled) {
        if (!raw.server.cert_path || typeof raw.server.cert_path !== "string") {
            throw new Error("[server] cert_path is required when ssl_enabled is true");
        }
        if (!raw.server.key_path || typeof raw.server.key_path !== "string") {
            throw new Error("[server] key_path is required when ssl_enabled is true");
        }
    }

    // ── [services] ───────────────────────────────────────────
    if (!raw.services || typeof raw.services !== "object" || Object.keys(raw.services).length === 0) {
        throw new Error("At least one [services.*] section is required");
    }

    for (const [name, svc] of Object.entries(raw.services)) {
        const service = svc as Record<string, unknown>;

        if (typeof service.target !== "string" || (service.target as string).length === 0) {
            throw new Error(`[services.${name}] target must be a non-empty string`);
        }
        if (typeof service.strip_prefix !== "boolean") {
            throw new Error(`[services.${name}] strip_prefix must be a boolean`);
        }
        if (service.timeout_ms !== undefined) {
            if (typeof service.timeout_ms !== "number" || (service.timeout_ms as number) < 1) {
                throw new Error(`[services.${name}] timeout_ms must be a positive number`);
            }
        }
        if (service.rate_limit !== undefined) {
            if (typeof service.rate_limit !== "number" || (service.rate_limit as number) < 1) {
                throw new Error(`[services.${name}] rate_limit must be a positive number`);
            }
        }
    }

    return raw as SentryGateConfig;
}
