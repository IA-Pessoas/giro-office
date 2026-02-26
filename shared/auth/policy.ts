import type { AuthContext, AuthPolicy } from "./types.js";

export function hasRequiredPermission(context: AuthContext, minPermission: number): boolean {
  return typeof context.claims.permission === "number" && context.claims.permission >= minPermission;
}

export function canAccessRoute(context: AuthContext, policy: AuthPolicy): boolean {
  if (typeof policy.minPermission === "number") {
    return hasRequiredPermission(context, policy.minPermission);
  }

  return true;
}
