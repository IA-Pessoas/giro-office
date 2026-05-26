import { useMemo } from "react";
import type { UseQueryResult } from "@tanstack/react-query";

import { useAuth } from "@/context/AuthContext";
import { permissionService } from "@modules/users/services/permissionService";
import { normalizePermissionResponse } from "@modules/users/utils/permissionUtils";
import { useFetch } from "@shared/hooks";
import {
  resolveContabilPermissionAccess,
  type ContabilPermissionAccess,
} from "./contabilPermissionAccess";

type ContabilPermissionPayload = Awaited<ReturnType<typeof permissionService.getByUserId>>;
type ContabilKnownPermissions = ReturnType<typeof normalizePermissionResponse>["known"];

interface UseContabilPermissionsResult extends ContabilPermissionAccess {
  user: ReturnType<typeof useAuth>["user"];
  permissionQuery: UseQueryResult<ContabilPermissionPayload, Error>;
  knownPermissions: ContabilKnownPermissions | null;
}

export function useContabilPermissions(): UseContabilPermissionsResult {
  const { user } = useAuth();

  const permissionQuery = useFetch(
    ["contabil", "permissions", user?.id ?? ""],
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

  const access = resolveContabilPermissionAccess(knownPermissions?.contabil, user?.permission);

  return {
    user,
    permissionQuery,
    knownPermissions,
    ...access,
  };
}
