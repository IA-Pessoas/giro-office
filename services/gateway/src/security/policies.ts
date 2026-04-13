import type { AuthPolicy } from "@workspace/shared";

const exactRoutePolicies = new Map<string, AuthPolicy>([["POST /user", { minPermission: 2 }]]);

const routePolicyMatchers: Array<{
  method: string;
  path: RegExp;
  policy: AuthPolicy;
}> = [{ method: "PUT", path: /^\/user\/permission\/[^/]+$/, policy: { minPermission: 2 } }];

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
