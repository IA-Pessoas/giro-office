import type { ModulePermissions } from "./modules.js";
import type { AuthContext, AuthPolicy } from "./types.js";

const MODULE_ADMIN_PERMISSION = 3;

export function hasRequiredPermission(context: AuthContext, minPermission: number): boolean {
  return (
    typeof context.claims.permission === "number" && context.claims.permission >= minPermission
  );
}

function isExplicitOwner(context: AuthContext): boolean {
  return context.claims.type === "owner";
}

function hasGlobalAdminPermission(context: AuthContext): boolean {
  return isExplicitOwner(context);
}

function hasExplicitModulePermission(
  context: AuthContext,
  module: string,
  minPermission: number,
): boolean {
  const modulePermission = context.claims.modules?.[module as keyof ModulePermissions];
  return typeof modulePermission === "number" && modulePermission >= minPermission;
}

function canManageUsers(context: AuthContext): boolean {
  return (
    isExplicitOwner(context) || hasExplicitModulePermission(context, "rh", MODULE_ADMIN_PERMISSION)
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
    return isExplicitOwner(context);
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
