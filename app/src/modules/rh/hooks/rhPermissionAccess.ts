export interface ResolveRhPermissionAccessInput {
  hasUser: boolean;
  permission?: number | null;
  rh?: number | null;
  departmentModule?: string | null;
}

export interface RhPermissionAccess {
  rhLevel: number | null;
  isGlobalAdmin: boolean;
  canAccessRhPortal: boolean;
  canUseRhSelfService: boolean;
  canManageRh: boolean;
}

const GLOBAL_ADMIN_PERMISSION = 2;

export function resolveRhPermissionAccess({
  hasUser,
  permission,
  rh,
}: ResolveRhPermissionAccessInput): RhPermissionAccess {
  const rhLevel = typeof rh === "number" ? rh : null;
  const isGlobalAdmin =
    typeof permission === "number" && permission >= GLOBAL_ADMIN_PERMISSION;
  const canAccessRhPortal = Boolean(hasUser);
  const canUseRhSelfService =
    Boolean(hasUser) && (isGlobalAdmin || rhLevel === null || rhLevel >= 1);
  const canManageRh = Boolean(hasUser) && (isGlobalAdmin || (rhLevel ?? 0) >= 2);

  return {
    rhLevel,
    isGlobalAdmin,
    canAccessRhPortal,
    canUseRhSelfService,
    canManageRh,
  };
}
