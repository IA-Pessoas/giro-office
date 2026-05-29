import { useAuth } from "@/context/AuthContext";
import { useModuleAccess } from "@modules/auth";

interface RhPermissionState {
  isLoading: boolean;
  error: Error | null;
}

interface UseRhPermissionsResult {
  user: ReturnType<typeof useAuth>["user"];
  permissionQuery: RhPermissionState;
  canAccessRhModule: boolean;
  canViewRhDashboard: boolean;
  isRhResponsible: boolean;
  isGlobalAdmin: boolean;
  canManageRh: boolean;
}

export function useRhPermissions(scope: string): UseRhPermissionsResult {
  const { user } = useAuth();
  const { access, departmentModule, isLoading } = useModuleAccess("rh");
  const explicitRhPermission = user?.modules?.rh;
  const isRhResponsible = Boolean(
    explicitRhPermission !== null &&
      explicitRhPermission !== undefined &&
      explicitRhPermission >= 1,
  );
  const isGlobalAdmin = user?.permission === 2;
  const canViewRhDashboard = departmentModule === "rh" || isGlobalAdmin;
  void scope;

  return {
    user,
    permissionQuery: {
      isLoading,
      error: null,
    },
    canAccessRhModule: access.canView,
    canViewRhDashboard,
    isRhResponsible,
    isGlobalAdmin,
    canManageRh: isRhResponsible || isGlobalAdmin,
  };
}
