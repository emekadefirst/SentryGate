// src/middleware/rlimits.middleware.ts

export class SentryRateLimiter {
  // Key: IP address, Value: { count: number, resetTime: number }
  private static visitors = new Map<string, { count: number; resetTime: number }>();

  /**
   * Checks if a request should be blocked
   * @param ip The visitor's IP address
   * @param limit Max requests allowed per window
   * @param windowMs The time window in milliseconds (e.g., 60000 for 1 minute)
   */
  static isSpamming(ip: string, limit: number = 60, windowMs: number = 60000): boolean {
    const now = Date.now();
    const record = this.visitors.get(ip);

    // 1. New visitor or window expired
    if (!record || now > record.resetTime) {
      this.visitors.set(ip, { count: 1, resetTime: now + windowMs });
      return false;
    }

    // 2. Increment count
    record.count++;

    // 3. Check if over limit
    if (record.count > limit) {
      return true;
    }

    return false;
  }
}