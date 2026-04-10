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

    // Console output for live monitoring
    const color = status >= 400 ? "❌" : "✅";
    console.log(`${color} [${timestamp}] ${method} ${path} (${duration}ms)`);

    try {
      const line = JSON.stringify(logEntry) + "\n";
      
      // We wrap the path in Bun.file() to satisfy the type requirement
      const targetFile = Bun.file(this.logPath);
      
      await Bun.write(targetFile, line, { append: true });
    } catch (err) {
      console.error("🛡️ SentryGate Logger Error:", err);
    }
  }
}