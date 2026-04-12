import type { Service } from "./types.core";

export class SentryRouter {
  static resolve(pathname: string, services: Record<string, Service>) {
    const parts = pathname.split("/");
    // Ensure serviceName is at least an empty string to satisfy indexing
    const serviceName = parts[1] || ""; 

    // 1. Try to find the specific service (e.g., 'api')
    let service = services[serviceName];
    let finalPath = pathname;

    if (!service) {
      service = services["root"] || services["default"];
      
      // If even the fallback doesn't exist, THEN we return null (404)
      if (!service) return null;
    
    } else {
      if (service.strip_prefix) {
        finalPath = pathname.replace(`/${serviceName}`, "") || "/";
      }
    }

    const cleanTarget = service.target.replace(/\/$/, "");

    return {
      targetUrl: cleanTarget + finalPath,
      service
    };
  }
}