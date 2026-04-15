import { appendFile } from "node:fs/promises";
import { join } from "node:path";

export class SentryLogger {
    private static readonly logPath = join(process.cwd(), "sentrygate.log");

    static async logRequest(
        id: string,
        method: string,
        path: string,
        status: number,
        duration: string
    ): Promise<void> {
        const timestamp = new Date().toISOString();
        const icon = status >= 500 ? "🔴" : status >= 400 ? "❌" : "✅";

        console.log(`${icon} [${timestamp}] ${method} ${path} → ${status} (${duration}ms)`);

        const line = JSON.stringify({
            timestamp,
            id,
            method,
            path,
            status,
            duration: `${duration}ms`,
        }) + "\n";

        try {
            await appendFile(SentryLogger.logPath, line);
        } catch (err) {
            console.error("🛡️ SentryGate Logger Error:", err);
        }
    }
}