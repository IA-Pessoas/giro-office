import type { AuthPolicy } from "@workspace/shared";

const routePolicies = new Map<string, AuthPolicy>([
  ["POST /users", { minPermission: 2 }],
  ["POST /permission", { minPermission: 2 }],
  ["POST /permission-specific", { minPermission: 2 }],
  ["PUT /permission-specific", { minPermission: 2 }],
  ["POST /permission-integracao", { minPermission: 2 }],
  ["PUT /permission-integracao", { minPermission: 2 }],
]);

export function getRoutePolicy(method: string, path: string): AuthPolicy | null {
  const key = `${method.toUpperCase()} ${path}`;
  return routePolicies.get(key) ?? null;
}
