const publicPathsAnyMethod = new Set<string>(["/health", "/ready"]);

const publicRoutesWithMethod = new Set<string>(["POST /session", "POST /start-config"]);

function isSocketIoPath(path: string): boolean {
  return path === "/socket.io" || path.startsWith("/socket.io/");
}

export function isPublicRoute(method: string, path: string): boolean {
  if (isSocketIoPath(path)) return true;
  if (publicPathsAnyMethod.has(path)) return true;
  const key = `${method.toUpperCase()} ${path}`;
  return publicRoutesWithMethod.has(key);
}
