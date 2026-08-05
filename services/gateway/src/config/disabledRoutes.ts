const DISABLED_GATEWAY_ROUTE_PATTERNS = [
  /^\/client\/commercial\/overview\/?$/,
  /^\/client\/[^/]+\/commercial\/?$/,
] as const;

const DISABLED_GATEWAY_OPENAPI_PATHS = new Set([
  "/client/commercial/overview",
  "/client/{id}/commercial",
]);

function normalizePath(path: string): string {
  try {
    return new URL(path, "http://localhost").pathname;
  } catch {
    return path;
  }
}

export function isGatewayRouteDisabled(path: string): boolean {
  const normalizedPath = normalizePath(path);
  return DISABLED_GATEWAY_ROUTE_PATTERNS.some((pattern) => pattern.test(normalizedPath));
}

export function isGatewayOpenApiPathDisabled(path: string): boolean {
  return DISABLED_GATEWAY_OPENAPI_PATHS.has(path);
}
