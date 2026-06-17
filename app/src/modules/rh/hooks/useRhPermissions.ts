import { useAuth } from "@/context/AuthContext";
import { useAccessStore } from "@modules/auth";
import { resolveRhPermissionAccess } from "./rhPermissionAccess";

interface RhPermissionState {
  isLoading: boolean;
  error: Error | null;
}

interface UseRhPermissionsResult {
  user: ReturnType<typeof useAuth>["user"];
  permissionQuery: RhPermissionState;
  rhLevel: number | null;
  canAccessRhPortal: boolean;
  canUseRhSelfService: boolean;
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
  const departmentModule = useAccessStore((snapshot) => snapshot.departmentModule);
  const isLoading = useAccessStore((snapshot) => snapshot.isLoading);
  const permissionError = useAccessStore((snapshot) => snapshot.error);
  const explicitRhPermission = user?.modules?.rh;
  const {
    rhLevel,
    isGlobalAdmin,
    canAccessRhPortal,
    canUseRhSelfService,
    canManageRh,
  } = resolveRhPermissionAccess({
    hasUser: Boolean(user),
    permission: user?.permission,
    rh: explicitRhPermission,
    departmentModule,
  });
  const canViewRhDashboard = canManageRh;
  const canManageRhRequests = canManageRh;
  const canManageRhScore = canManageRh;
  const canManageRhTimeBank = canManageRh;
  const canManageRhTimesheets = canManageRh;
  // Mantemos workday separado para permitir divergencia futura sem refactor transversal nas telas de ponto.
  const canManageRhWorkday = canManageRh;
  const isRhResponsible = canManageRh;
  void scope;

  return {
    user,
    permissionQuery: {
      isLoading,
      error: permissionError,
    },
    rhLevel,
    canAccessRhPortal,
    canUseRhSelfService,
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
