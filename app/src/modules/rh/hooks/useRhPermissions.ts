import { useAuth } from "@/context/AuthContext";
import { isOrganizationOwner, useAccessStore } from "@modules/auth";

const RH_ADMIN_PERMISSION = 3;

interface RhPermissionState {
  isLoading: boolean;
  error: Error | null;
}

interface UseRhPermissionsResult {
  user: ReturnType<typeof useAuth>["user"];
  permissionQuery: RhPermissionState;
  canAccessRhPortal: boolean;
  canViewRhDashboard: boolean;
  isRhResponsible: boolean;
  isGlobalAdmin: boolean;
  canManageRh: boolean;
  canManageRhRequests: boolean;
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
  const hasRhAdminPermission = Boolean(
    explicitRhPermission !== null &&
      explicitRhPermission !== undefined &&
      explicitRhPermission >= RH_ADMIN_PERMISSION,
  );
  const isGlobalAdmin = isOrganizationOwner(user);
  const isRhResponsible = hasRhAdminPermission;
  const canManageRh = hasRhAdminPermission || isGlobalAdmin;
  const canViewRhDashboard = canManageRh;
  const canManageRhRequests = canManageRh;
  const canManageRhScore = canManageRh;
  const canManageRhTimeBank = canManageRh;
  const canManageRhTimesheets = canManageRh;
  // Mantemos workday separado para permitir divergencia futura sem refactor transversal nas telas de ponto.
  const canManageRhWorkday = canManageRh;
  void scope;

  return {
    user,
    permissionQuery: {
      isLoading,
      error: permissionError,
    },
    canAccessRhPortal: Boolean(user),
    canViewRhDashboard,
    isRhResponsible,
    isGlobalAdmin,
    canManageRh,
    canManageRhRequests,
    canManageRhScore,
    canManageRhTimeBank,
    canManageRhTimesheets,
    canManageRhWorkday,
  };
}
