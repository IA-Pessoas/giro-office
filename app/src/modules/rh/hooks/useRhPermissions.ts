import { useAuth } from "@/context/AuthContext";
import { isAdminPermission, useAccessStore } from "@modules/auth";

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
  const departmentModule = useAccessStore((snapshot) => snapshot.departmentModule);
  const isLoading = useAccessStore((snapshot) => snapshot.isLoading);
  const permissionError = useAccessStore((snapshot) => snapshot.error);
  const explicitRhPermission = user?.modules?.rh;
  const isRhResponsible = Boolean(
    explicitRhPermission !== null &&
      explicitRhPermission !== undefined &&
      explicitRhPermission >= 1,
  );
  const isRhDepartmentUser = departmentModule === "rh";
  const isGlobalAdmin = isAdminPermission(user?.permission);
  const canViewRhDashboard = isRhDepartmentUser || isGlobalAdmin || isRhResponsible;
  const canManageRh = isRhResponsible || isGlobalAdmin;
  const canManageRhRequests = isRhDepartmentUser || isRhResponsible || isGlobalAdmin;
  const canManageRhScore = isRhDepartmentUser || isRhResponsible || isGlobalAdmin;
  const canManageRhTimeBank = isRhDepartmentUser || isRhResponsible || isGlobalAdmin;
  const canManageRhTimesheets = isRhDepartmentUser || isRhResponsible || isGlobalAdmin;
  // Mantemos workday separado para permitir divergencia futura sem refactor transversal nas telas de ponto.
  const canManageRhWorkday = isRhDepartmentUser || isRhResponsible || isGlobalAdmin;
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
