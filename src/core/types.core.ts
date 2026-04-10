export interface Service {
    target: string;
    strip_prefix: boolean;
    auth_required?: boolean;
    timeout_ms?: number;
}

export interface ServerConfig {
    port: number;
    name: string;
    ssl_enabled?: boolean;
    cert_path?: string;
    key_path?: string;
}

export interface SentryGateConfig {
    server: ServerConfig;
    services: Record<string, Service>;
}