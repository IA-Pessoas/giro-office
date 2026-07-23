import { useModuleAccess } from "@modules/auth";
import {
  resolveContabilPermissionAccess,
  type ContabilPermissionAccess,
} from "./contabilPermissionAccess";

interface UseContabilPermissionsResult extends ContabilPermissionAccess {
  isLoading: boolean;
  source: "admin" | "department" | "additional-module" | "none";
}

export function useContabilPermissions(): UseContabilPermissionsResult {
  const { access, isLoading } = useModuleAccess("contabil");
  const contabilAccess = resolveContabilPermissionAccess(access);

  return {
    ...contabilAccess,
    isLoading,
    source: access.source,
  };
}
