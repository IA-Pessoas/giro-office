import { useMemo } from "react";
import type { UseQueryResult } from "@tanstack/react-query";

import { useAuth } from "@/context/AuthContext";
import { permissionService } from "@modules/users/services/permissionService";
import { normalizePermissionResponse } from "@modules/users/utils/permissionUtils";
import { useFetch } from "@shared/hooks";

type RhPermissionPayload = Awaited<ReturnType<typeof permissionService.getByUserId>>;
type RhKnownPermissions = ReturnType<typeof normalizePermissionResponse>["known"];

interface UseRhPermissionsResult {
  user: ReturnType<typeof useAuth>["user"];
  permissionQuery: UseQueryResult<RhPermissionPayload, Error>;
  knownPermissions: RhKnownPermissions | null;
  isRhResponsible: boolean;
  isGlobalAdmin: boolean;
  canManageRh: boolean;
}

export function useRhPermissions(scope: string): UseRhPermissionsResult {
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
