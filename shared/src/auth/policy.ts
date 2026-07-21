import type { AuthContext, AuthPolicy } from "./types.js";

const GLOBAL_ADMIN_PERMISSION = 2;

function isOrganizationActor(context: AuthContext): boolean {
  return context.actorKind === "organization";
}

export function hasRequiredPermission(context: AuthContext, minPermission: number): boolean {
  return (
    isOrganizationActor(context) &&
    typeof context.claims.permission === "number" &&
    context.claims.permission >= minPermission
  );
}

function isExplicitOwner(context: AuthContext): boolean {
  return isOrganizationActor(context) && context.claims.type === "owner";
}

function isLegacyGlobalAdmin(context: AuthContext): boolean {
  return (
    isOrganizationActor(context) &&
    context.claims.type === undefined &&
    hasRequiredPermission(context, GLOBAL_ADMIN_PERMISSION)
  );
}

function hasGlobalAdminPermission(context: AuthContext): boolean {
  return isExplicitOwner(context) || isLegacyGlobalAdmin(context);
}

function isPlatformSuperAdmin(context: AuthContext): boolean {
  return context.isPlatformAdmin === true;
}

function hasSupportAccess(context: AuthContext): boolean {
  return context.isSupportMode === true && context.organizationId.length > 0;
}

function hasExplicitModulePermission(
  context: AuthContext,
  module: string,
  minPermission: number,
): boolean {
  const modulePermission = context.claims.modules?.[module];
  return (
    isOrganizationActor(context) &&
    typeof modulePermission === "number" &&
    modulePermission >= minPermission
  );
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
  if (policy.special === "platformOnly") {
    return isPlatformSuperAdmin(context);
  }

  if (hasSupportAccess(context)) {
    return true;
  }

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
