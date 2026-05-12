import type { AuthPolicy } from "@workspace/shared";

const adminPolicy: AuthPolicy = { minPermission: 2 };

const exactRoutePolicies = new Map<string, AuthPolicy>([
  ["GET /user", adminPolicy],
  ["POST /user", adminPolicy],
]);

const routePolicyMatchers: Array<{
  method: string;
  path: RegExp;
  policy: AuthPolicy;
}> = [
  { method: "GET", path: /^\/user\/permission\/[^/]+$/, policy: adminPolicy },
  { method: "PUT", path: /^\/user\/permission\/[^/]+$/, policy: adminPolicy },
  { method: "GET", path: /^\/user\/(?!me$|session$|start-config$)[^/]+$/, policy: adminPolicy },
  { method: "PATCH", path: /^\/user\/(?!me$|session$|start-config$)[^/]+$/, policy: adminPolicy },
  { method: "DELETE", path: /^\/user\/(?!me$|session$|start-config$)[^/]+$/, policy: adminPolicy },
  { method: "GET", path: /^\/user\/[^/]+\/photo$/, policy: adminPolicy },
  { method: "POST", path: /^\/user\/[^/]+\/photo$/, policy: adminPolicy },
  { method: "DELETE", path: /^\/user\/[^/]+\/photo$/, policy: adminPolicy },
];

export function getRoutePolicy(method: string, path: string): AuthPolicy | null {
  const normalizedMethod = method.toUpperCase();
  const exactKey = `${normalizedMethod} ${path}`;
  const exactPolicy = exactRoutePolicies.get(exactKey);
  if (exactPolicy) {
    return exactPolicy;
  }

  const matchedPolicy = routePolicyMatchers.find(
    (matcher) => matcher.method === normalizedMethod && matcher.path.test(path),
  );

  return matchedPolicy?.policy ?? null;
}
