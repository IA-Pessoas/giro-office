import type { AuthPolicy } from "@workspace/shared";

const routePolicies = new Map<string, AuthPolicy>([["POST /user", { minPermission: 2 }]]);

export function getRoutePolicy(method: string, path: string): AuthPolicy | null {
  const key = `${method.toUpperCase()} ${path}`;
  return routePolicies.get(key) ?? null;
}
