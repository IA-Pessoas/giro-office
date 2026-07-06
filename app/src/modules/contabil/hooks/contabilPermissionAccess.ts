import type { ModuleAccess } from "@modules/auth";

export interface ContabilPermissionAccess {
  canViewContabil: boolean;
  canEditContabil: boolean;
  isReadOnlyContabil: boolean;
}

export function resolveContabilPermissionAccess(
  access: Pick<ModuleAccess, "canView" | "canEdit">,
): ContabilPermissionAccess {
  return {
    canViewContabil: access.canView,
    canEditContabil: access.canEdit,
    isReadOnlyContabil: access.canView && !access.canEdit,
  };
}
