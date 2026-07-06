import type { AuthContext, AuthPolicy } from "./types.js";

const GLOBAL_ADMIN_PERMISSION = 2;

export function hasRequiredPermission(context: AuthContext, minPermission: number): boolean {
  return (
    typeof context.claims.permission === "number" && context.claims.permission >= minPermission
  );
}

function isExplicitOwner(context: AuthContext): boolean {
  return context.claims.type === "owner";
}

function isLegacyGlobalAdmin(context: AuthContext): boolean {
  return (
    context.claims.type === undefined && hasRequiredPermission(context, GLOBAL_ADMIN_PERMISSION)
  );
}

function hasGlobalAdminPermission(context: AuthContext): boolean {
  return isExplicitOwner(context) || isLegacyGlobalAdmin(context);
}

function hasExplicitModulePermission(
  context: AuthContext,
  module: string,
  minPermission: number,
): boolean {
  const modulePermission = context.claims.modules?.[module];
  return typeof modulePermission === "number" && modulePermission >= minPermission;
}

function canManageUsers(context: AuthContext): boolean {
  return (
    isExplicitOwner(context) ||
    isLegacyGlobalAdmin(context) ||
    hasExplicitModulePermission(context, "rh", GLOBAL_ADMIN_PERMISSION)
  );
}

function hasRequiredModulePermission(
  context: AuthContext,
  module: string,
  minPermission: number,
): boolean {
  if (hasGlobalAdminPermission(context)) {
    return true;
  }

  return hasExplicitModulePermission(context, module, minPermission);
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
  if (policy.special === "ownerOnly") {
    return isExplicitOwner(context) || isLegacyGlobalAdmin(context);
  }

  if (policy.special === "manageUsers" && !canManageUsers(context)) {
    return false;
  }

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
