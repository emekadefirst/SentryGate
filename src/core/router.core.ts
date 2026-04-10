import type { Service } from "./types.core";

export class SentryRouter {
  static resolve(pathname: string, services: Record<string, Service>) {
    const parts = pathname.split("/");
    const serviceName = parts[1];
    const service = services[serviceName as string];

    if (!service) return null;

    const finalPath = service.strip_prefix 
      ? pathname.replace(`/${serviceName}`, "") || "/" 
      : pathname;

    // Ensure we don't have double slashes
    const cleanTarget = service.target.endsWith("/") 
      ? service.target.slice(0, -1) 
      : service.target;

    return {
      targetUrl: cleanTarget + finalPath,
      service,
      serviceName
    };
  }
}