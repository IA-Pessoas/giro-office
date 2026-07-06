import type { AuthContext, AuthPolicy } from "./types.js";

const GLOBAL_ADMIN_PERMISSION = 2;

export function hasRequiredPermission(context: AuthContext, minPermission: number): boolean {
  return (
    typeof context.claims.permission === "number" && context.claims.permission >= minPermission
  );
}

function hasGlobalAdminPermission(context: AuthContext): boolean {
  return hasRequiredPermission(context, GLOBAL_ADMIN_PERMISSION);
}

function hasRequiredModulePermission(
  context: AuthContext,
  module: string,
  minPermission: number,
): boolean {
  if (hasGlobalAdminPermission(context)) {
    return true;
  }

  const modulePermission = context.claims.modules?.[module];
  return typeof modulePermission === "number" && modulePermission >= minPermission;
}

function hasAnyRequiredModulePermission(
  context: AuthContext,
  modules: string[],
  minPermission: number,
): boolean {
  if (hasGlobalAdminPermission(context)) {
    return true;
  }

  return modules.some((module) => hasRequiredModulePermission(context, module, minPermission));
}

export function canAccessRoute(context: AuthContext, policy: AuthPolicy): boolean {
  if (
    typeof policy.minPermission === "number" &&
    !hasRequiredPermission(context, policy.minPermission)
  ) {
    return false;
  }

  if (
    policy.modulePermission &&
    !hasRequiredModulePermission(
      context,
      policy.modulePermission.module,
      policy.modulePermission.minPermission,
    )
  ) {
    return false;
  }

  if (
    policy.anyModulePermission &&
    !hasAnyRequiredModulePermission(
      context,
      policy.anyModulePermission.modules,
      policy.anyModulePermission.minPermission,
    )
  ) {
    return false;
  }

  return true;
}
