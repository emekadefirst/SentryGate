import { join } from "node:path";

export class SentryLogger {
  private static logPath = join(process.cwd(), "sentrygate.log");

  static async logRequest(id: string, method: string, path: string, status: number, duration: string) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      id,
      method,
      path,
      status,
      duration: `${duration}ms`,
    };

    // 1. Console visibility
    const color = status >= 400 ? "❌" : "✅";
    console.log(`${color} [${timestamp}] ${method} ${path} (${duration}ms)`);

    // 2. Persistent Logging
    try {
      const line = JSON.stringify(logEntry) + "\n";
      await Bun.write(this.logPath as any, line, { append: true } as any);
      
    } catch (err) {
      console.error("🛡️ SentryGate Logger Error:", err);
    }
  }
}