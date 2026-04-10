import type { Service } from "./types.core";

export class SentryRouter {
  static resolve(pathname: string, services: Record<string, Service>) {
    const parts = pathname.split("/");
    const serviceName = parts[1];
    if (!serviceName || !services) return null;

    const service = services[serviceName];
    if (!service) return null;

    const finalPath = service.strip_prefix 
      ? pathname.replace(`/${serviceName}`, "") || "/" 
      : pathname;

    const cleanTarget = service.target.replace(/\/$/, "");

    return {
      targetUrl: cleanTarget + finalPath,
      service
    };
  }
}