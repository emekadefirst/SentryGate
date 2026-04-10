export class HeaderTool {
  /**
   * Cleans headers to prevent backend fingerprinting
   */
  static shield(headers: Headers, gateName: string, requestId: string): Headers {
    const newHeaders = new Headers(headers);
    
    // Mask Backend Identity
    newHeaders.delete("Server");
    newHeaders.delete("X-Powered-By");
    newHeaders.delete("Host");

    // Inject Gateway Identity
    newHeaders.set("X-Sentry-Processed-By", gateName);
    newHeaders.set("X-Sentry-ID", requestId);

    return newHeaders;
  }
}