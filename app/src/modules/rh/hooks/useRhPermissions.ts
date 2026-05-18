import { useMemo } from "react";

import { useAuth } from "@/context/AuthContext";
import { permissionService } from "@modules/users/services/permissionService";
import { normalizePermissionResponse } from "@modules/users/utils/permissionUtils";
import { useFetch } from "@shared/hooks";

export function useRhPermissions(scope: string) {
  const { user } = useAuth();

  const permissionQuery = useFetch(
    ["rh", scope, "permissions", user?.id ?? ""],
    () => permissionService.getByUserId(user?.id ?? ""),
    {
      enabled: Boolean(user?.id),
      retry: false,
      refetchOnWindowFocus: false,
    },
  );

  const knownPermissions = useMemo(() => {
    if (!permissionQuery.data) {
      return null;
    }

    return normalizePermissionResponse(permissionQuery.data).known;
  }, [permissionQuery.data]);

  const isRhResponsible = Boolean(
    knownPermissions?.rh !== null &&
      knownPermissions?.rh !== undefined &&
      knownPermissions.rh >= 1,
  );
  const isGlobalAdmin = user?.permission === 2;

  return {
    user,
    permissionQuery,
    knownPermissions,
    isRhResponsible,
    isGlobalAdmin,
    canManageRh: isRhResponsible || isGlobalAdmin,
  };
}
