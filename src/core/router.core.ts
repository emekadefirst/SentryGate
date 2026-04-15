import type { Service } from "./types.core";

export class SentryRouter {
  static resolve(pathname: string, services: Record<string, Service>) {
    const parts = pathname.split("/");
    // Ensure serviceName is at least an empty string to satisfy indexing
    const serviceName = parts[1] || "";

    // 1. Try to find the specific service (e.g., 'api')
    let service = services[serviceName];
    let finalPath = pathname;
    let resolvedName = serviceName;

    if (!service) {
      // Fallback to root or default
      if (services["root"]) {
        service = services["root"];
        resolvedName = "root";
      } else if (services["default"]) {
        service = services["default"];
        resolvedName = "default";
      } else {
        // If even the fallback doesn't exist, THEN we return null (404)
        return null;
      }
    } else {
      if (service.strip_prefix) {
        finalPath = pathname.replace(`/${serviceName}`, "") || "/";
      }
    }

    const cleanTarget = service.target.replace(/\/$/, "");

    return {
      targetUrl: cleanTarget + finalPath,
      service,
      serviceName: resolvedName,
    };
  }
}