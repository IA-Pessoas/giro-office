import type { AuthPolicy } from "@workspace/shared";

interface RoutePolicy {
  method: string;
  pathRegex: RegExp;
  policy: AuthPolicy;
}

const routePolicies: RoutePolicy[] = [
  {
    method: "POST",
    pathRegex: /^\/users$/,
    policy: { minPermission: 2 }
  },
  {
    method: "POST",
    pathRegex: /^\/permission$/,
    policy: { minPermission: 2 }
  },
  {
    method: "POST",
    pathRegex: /^\/permission-specific$/,
    policy: { minPermission: 2 }
  },
  {
    method: "PUT",
    pathRegex: /^\/permission-specific$/,
    policy: { minPermission: 2 }
  },
  {
    method: "POST",
    pathRegex: /^\/permission-integracao$/,
    policy: { minPermission: 2 }
  },
  {
    method: "PUT",
    pathRegex: /^\/permission-integracao$/,
    policy: { minPermission: 2 }
  }
];

export function getRoutePolicy(method: string, path: string): AuthPolicy | null {
  const found = routePolicies.find((entry) => {
    return entry.method === method.toUpperCase() && entry.pathRegex.test(path);
  });

  return found?.policy ?? null;
}
