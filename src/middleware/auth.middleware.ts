export class SentryAuth {
    private static cryptoKey: CryptoKey | null = null;

    /**
     * Initializes the auth middleware by importing the HMAC key from the
     * SENTRY_AUTH_SECRET environment variable. Must be called once at startup.
     * If the env var is not set, auth-required routes will reject all requests.
     */
    static async init(): Promise<void> {
        const secret = process.env.SENTRY_AUTH_SECRET;
        if (!secret) return;

        this.cryptoKey = await crypto.subtle.importKey(
            "raw",
            new TextEncoder().encode(secret),
            { name: "HMAC", hash: "SHA-256" },
            false,
            ["verify"]
        );
    }

    /**
     * Returns true if a signing key has been loaded.
     */
    static isConfigured(): boolean {
        return this.cryptoKey !== null;
    }

    /**
     * Validates the request's Bearer JWT against the loaded HMAC-SHA256 key.
     * Checks signature, expiration (exp), and not-before (nbf).
     */
    static async isAuthenticated(req: Request): Promise<boolean> {
        const authHeader = req.headers.get("Authorization");
        if (!authHeader || !authHeader.startsWith("Bearer ")) return false;

        const token = authHeader.substring(7);
        if (!token) return false;

        if (!this.cryptoKey) return false;

        return this.verifyJWT(token);
    }

    private static async verifyJWT(token: string): Promise<boolean> {
        try {
            const parts = token.split(".");
            if (parts.length !== 3) return false;

            const headerB64 = parts[0] as string;
            const payloadB64 = parts[1] as string;
            const signatureB64 = parts[2] as string;

            // Verify HMAC-SHA256 signature
            const signatureInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
            const signature = this.base64UrlDecode(signatureB64) as Uint8Array<ArrayBuffer>;

            const valid = await crypto.subtle.verify(
                "HMAC",
                this.cryptoKey!,
                signature,
                signatureInput
            );
            if (!valid) return false;

            // Decode and validate claims
            const payload = JSON.parse(this.base64UrlDecodeString(payloadB64));

            const nowSec = Date.now() / 1000;

            // Reject expired tokens
            if (payload.exp && nowSec > payload.exp) return false;

            // Reject tokens used before their not-before time
            if (payload.nbf && nowSec < payload.nbf) return false;

            return true;
        } catch {
            return false;
        }
    }

    private static base64UrlDecode(str: string): Uint8Array {
        const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
        const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
        const binary = atob(padded);
        return Uint8Array.from(binary, (c) => c.charCodeAt(0));
    }

    private static base64UrlDecodeString(str: string): string {
        const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
        const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
        return atob(padded);
    }
}