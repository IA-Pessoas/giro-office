export const RH_SELF_SERVICE_PERMISSION = 1;
export const RH_WORKFLOW_MESSAGE_PERMISSION = 2;
export const RH_ADMIN_PERMISSION = 3;

interface RhPermissionCapabilities {
  canAccessRhPortal: boolean;
  canUseRhWorkflowMessages: boolean;
  canViewRhDashboard: boolean;
  canManageRh: boolean;
  canManageRhRequests: boolean;
  canManageRhScore: boolean;
  canManageRhTimeBank: boolean;
  canManageRhTimesheets: boolean;
  canManageRhWorkday: boolean;
}

export function resolveRhPermissionCapabilities(
  explicitRhPermission: number | null | undefined,
  isGlobalAdmin: boolean,
): RhPermissionCapabilities {
  const hasSelfServicePermission =
    explicitRhPermission !== null &&
    explicitRhPermission !== undefined &&
    explicitRhPermission >= RH_SELF_SERVICE_PERMISSION;
  const hasRhAdminPermission =
    explicitRhPermission !== null &&
    explicitRhPermission !== undefined &&
    explicitRhPermission >= RH_ADMIN_PERMISSION;
  const hasRhWorkflowMessagePermission =
    explicitRhPermission !== null &&
    explicitRhPermission !== undefined &&
    explicitRhPermission >= RH_WORKFLOW_MESSAGE_PERMISSION;
  const canManageRh = isGlobalAdmin || hasRhAdminPermission;
  const canAccessRhPortal = isGlobalAdmin || hasSelfServicePermission;

  return {
    canAccessRhPortal,
    canUseRhWorkflowMessages: isGlobalAdmin || hasRhWorkflowMessagePermission,
    canViewRhDashboard: canManageRh,
    canManageRh,
    canManageRhRequests: canManageRh,
    canManageRhScore: canManageRh,
    canManageRhTimeBank: canManageRh,
    canManageRhTimesheets: canManageRh,
    canManageRhWorkday: canManageRh,
  };
}
