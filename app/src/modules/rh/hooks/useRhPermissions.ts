import { useAuth } from "@/context/AuthContext";
import { isOrganizationOwner, useAccessStore } from "@modules/auth";
import { resolveRhPermissionCapabilities } from "../utils/rhPermissions";

interface RhPermissionState {
  isLoading: boolean;
  error: Error | null;
}

interface UseRhPermissionsResult {
  user: ReturnType<typeof useAuth>["user"];
  permissionQuery: RhPermissionState;
  canAccessRhPortal: boolean;
  canUseRhWorkflowMessages: boolean;
  canViewRhDashboard: boolean;
  isRhResponsible: boolean;
  isGlobalAdmin: boolean;
  canManageRh: boolean;
  canManageRhRequests: boolean;
  canManageRhPointAdjustments: boolean;
  canManageRhScore: boolean;
  canManageRhTimeBank: boolean;
  canManageRhTimesheets: boolean;
  canManageRhWorkday: boolean;
}

export function useRhPermissions(scope: string): UseRhPermissionsResult {
  const { user } = useAuth();
  const isLoading = useAccessStore((snapshot) => snapshot.isLoading);
  const permissionError = useAccessStore((snapshot) => snapshot.error);
  const explicitRhPermission = user?.modules?.rh;
  const isGlobalAdmin = isOrganizationOwner(user);
  const capabilities = resolveRhPermissionCapabilities(explicitRhPermission, isGlobalAdmin);
  const isRhResponsible = capabilities.canManageRh;
  void scope;

  return {
    user,
    permissionQuery: {
      isLoading,
      error: permissionError,
    },
    canAccessRhPortal: Boolean(user) && capabilities.canAccessRhPortal,
    canUseRhWorkflowMessages: capabilities.canUseRhWorkflowMessages,
    canViewRhDashboard: capabilities.canViewRhDashboard,
    isRhResponsible,
    isGlobalAdmin,
    canManageRh: capabilities.canManageRh,
    canManageRhRequests: capabilities.canManageRhRequests,
    canManageRhPointAdjustments: capabilities.canManageRhPointAdjustments,
    canManageRhScore: capabilities.canManageRhScore,
    canManageRhTimeBank: capabilities.canManageRhTimeBank,
    canManageRhTimesheets: capabilities.canManageRhTimesheets,
    canManageRhWorkday: capabilities.canManageRhWorkday,
  };
}
