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

/** Owner, admin de RH ou admin de TI (o teto de concessão é aplicado no user-service). */
function canManageUsers(context: AuthContext): boolean {
  return (
    isExplicitOwner(context) ||
    hasExplicitModulePermission(context, "rh", MODULE_ADMIN_PERMISSION) ||
    hasExplicitModulePermission(context, "ti", MODULE_ADMIN_PERMISSION)
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
  if (policy.anyOf) {
    return policy.anyOf.some((alternative) => canAccessRoute(context, alternative));
  }

  if (policy.special === "platformOnly") {
    return context.actorKind === "platform" && context.isPlatformAdmin;
  }

  if (policy.special === "impersonationOnly") {
    return (
      context.actorKind === "organization" &&
      typeof context.claims.impersonator_platform_user_id === "string" &&
      context.claims.impersonator_platform_user_id.length > 0
    );
  }

  if (context.actorKind === "platform") {
    return false;
  }

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
