import { loadSentryConfig } from "./utils/loader.utils";
import { SentryGate } from "./core/engine.core";
import { SentryAuth } from "./middleware/auth.middleware";
import { join } from "node:path";

const VERSION = "1.0.0";

const HELP_TEXT = `
🛡️  SentryGate v${VERSION}
High-performance API gateway built on Bun

USAGE:
  sentrygate <command> [options]

COMMANDS:
  start             Start the gateway (default if no command given)
  init              Generate a starter sentrygate.toml in the current directory

OPTIONS:
  -c, --config      Path to sentrygate.toml (default: ./sentrygate.toml)
  -h, --help        Show this help message
  -v, --version     Show version

EXAMPLES:
  sentrygate start
  sentrygate start --config /etc/sentrygate/sentrygate.toml
  sentrygate init

ENVIRONMENT:
  SENTRY_AUTH_SECRET   HMAC-SHA256 key for JWT verification on auth-protected routes
`;

const DEFAULT_TOML = `# SentryGate Configuration
# Docs: https://github.com/emekadefirst/SentryGate

[base]
logging = true
default_rate_limit = true
custom_rate_limit = false

[server]
port = 80
name = "SentryGate"
ssl_enabled = false
# cert_path = "/etc/letsencrypt/live/yourdomain.com/fullchain.pem"
# key_path  = "/etc/letsencrypt/live/yourdomain.com/privkey.pem"

[services.root]
target = "http://localhost:3000"
strip_prefix = false
auth_required = false
timeout_ms = 5000
rate_limit = 60
`;

async function main() {
    const args = process.argv;

    // ── Flags ────────────────────────────────────────
    if (args.includes("--help") || args.includes("-h")) {
        console.log(HELP_TEXT);
        process.exit(0);
    }

    if (args.includes("--version") || args.includes("-v")) {
        console.log(`sentrygate v${VERSION}`);
        process.exit(0);
    }

    // ── Commands ─────────────────────────────────────
    if (args.includes("init")) {
        await handleInit();
        return;
    }

    // Default action: start (works with or without explicit "start" command)
    await handleStart();
}

async function handleInit() {
    const targetPath = join(process.cwd(), "sentrygate.toml");
    const file = Bun.file(targetPath);

    if (await file.exists()) {
        console.error("🛡️ SentryGate: sentrygate.toml already exists in this directory.");
        process.exit(1);
    }

    await Bun.write(targetPath, DEFAULT_TOML);
    console.log(`🛡️ SentryGate: Created sentrygate.toml in ${process.cwd()}`);
    console.log("   Edit the file to configure your services, then run: sentrygate start");
}

async function handleStart() {
    const args = process.argv;

    // Parse --config / -c flag
    let configPath: string | undefined;
    const configIdx = args.indexOf("--config") !== -1 ? args.indexOf("--config") : args.indexOf("-c");
    if (configIdx !== -1) {
        configPath = args[configIdx + 1];
        if (!configPath) {
            console.error("🛡️ SentryGate: --config requires a file path argument.");
            process.exit(1);
        }
    }

    try {
        const config = await loadSentryConfig(configPath);

        // Initialize JWT auth middleware
        await SentryAuth.init();

        // Warn if any service requires auth but no secret is configured
        const hasAuthService = Object.values(config.services).some(s => s.auth_required);
        if (hasAuthService && !SentryAuth.isConfigured()) {
            console.warn("⚠️  SentryGate: Services have auth_required=true but SENTRY_AUTH_SECRET is not set.");
            console.warn("   Requests to auth-protected routes will be rejected with 502.");
            console.warn("   Set SENTRY_AUTH_SECRET to a shared HMAC-SHA256 signing key.");
        }

        const gate = new SentryGate(config);
        const server = gate.start();

        // Graceful shutdown — drain in-flight requests before exiting
        const shutdown = () => {
            console.log("\n🛡️ SentryGate: Shutting down gracefully...");
            server.stop(true);
            process.exit(0);
        };

        process.on("SIGTERM", shutdown);
        process.on("SIGINT", shutdown);
    } catch (error: any) {
        console.error(error.message);
        process.exit(1);
    }
}

main();