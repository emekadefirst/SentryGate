class LRUBucketMap {
    private map = new Map<string, { tokens: number; lastRefill: number }>();
    private readonly maxSize: number;

    constructor(maxSize = 100_000) {
        this.maxSize = maxSize;
    }

    get(key: string) {
        const entry = this.map.get(key);
        if (!entry) return undefined;
        // Promote to most-recently-used by re-inserting at end
        this.map.delete(key);
        this.map.set(key, entry);
        return entry;
    }

    set(key: string, value: { tokens: number; lastRefill: number }) {
        if (this.map.has(key)) this.map.delete(key);
        else if (this.map.size >= this.maxSize) {
            // Evict LRU (first key in Map = oldest insertion)
            this.map.delete(this.map.keys().next().value!);
        }
        this.map.set(key, value);
    }

    delete(key: string) { this.map.delete(key); }
    entries() { return this.map.entries(); }
}

export class SentryRateLimiter {
    private static readonly buckets = new LRUBucketMap(100_000);
    private static readonly CAPACITY = 60;
    private static readonly REFILL_RATE = 1;
    private static readonly CLEANUP_INTERVAL = 120_000;

    static {
        setInterval(() => {
            const now = Date.now();
            for (const [key, bucket] of SentryRateLimiter.buckets.entries()) {
                const elapsed = (now - bucket.lastRefill) / 1000;
                const projected = bucket.tokens + elapsed * SentryRateLimiter.REFILL_RATE;
                if (projected >= SentryRateLimiter.CAPACITY) {
                    SentryRateLimiter.buckets.delete(key);
                }
            }
        }, SentryRateLimiter.CLEANUP_INTERVAL).unref();
    }

    /**
     * Token bucket rate limit check.
     * @param ip        - Client IP address
     * @param capacity  - Bucket capacity (defaults to global CAPACITY)
     * @param serviceKey - Optional service name for per-service rate limiting.
     *                     When provided, the bucket key becomes "ip:serviceKey"
     *                     so each service gets an independent limit.
     */
    static isSpamming(ip: string, capacity = SentryRateLimiter.CAPACITY, serviceKey?: string): boolean {
        const key = serviceKey ? `${ip}:${serviceKey}` : ip;
        const now = Date.now();
        const bucket = this.buckets.get(key);

        if (!bucket) {
            this.buckets.set(key, { tokens: capacity - 1, lastRefill: now });
            return false;
        }

        const elapsed = (now - bucket.lastRefill) / 1000;
        bucket.tokens = Math.min(capacity, bucket.tokens + elapsed * SentryRateLimiter.REFILL_RATE);
        bucket.lastRefill = now;

        if (bucket.tokens < 1) return true;

        bucket.tokens--;
        return false;
    }
}