export class HeaderTool {
  static shield(headers: Headers, gateName: string, requestId: string): Headers {
    const newHeaders = new Headers(headers);
    
    // Mask Backend Identity
    newHeaders.delete("Server");
    newHeaders.delete("X-Powered-By");

    // Inject Gateway Identity
    newHeaders.set("X-Sentry-Processed", gateName);
    newHeaders.set("X-Sentry-ID", requestId);

    return newHeaders;
  }
}