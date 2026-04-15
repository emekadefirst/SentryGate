export interface Service {
    target: string;
    strip_prefix: boolean;
    auth_required?: boolean;
    timeout_ms?: number;
    rate_limit?: number;
    ws_required?: boolean;
}

export interface ServerConfig {
    port: number;
    name: string;
    ssl_enabled?: boolean;
    cert_path?: string;
    key_path?: string;
}

export interface BaseConfig {
    logging: boolean;
    default_rate_limit: boolean;
    custom_rate_limit: boolean;
}

export interface SentryGateConfig {
    base: BaseConfig;
    server: ServerConfig;
    services: Record<string, Service>;
}

export interface WSData {
    target: string;
    requestId: string;
    path: string;
    upstream?: WebSocket;
}