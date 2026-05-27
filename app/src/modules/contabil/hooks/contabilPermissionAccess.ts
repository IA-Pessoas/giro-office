export interface ContabilPermissionAccess {
  canViewContabil: boolean;
  canEditContabil: boolean;
  isReadOnlyContabil: boolean;
}

export function resolveContabilPermissionAccess(
  contabilPermission: number | null | undefined,
  userPermission?: number | null,
): ContabilPermissionAccess {
  const isGlobalAdmin = userPermission === 2;
  const hasContabilPermission =
    contabilPermission !== null && contabilPermission !== undefined;
  const canViewContabil = hasContabilPermission || isGlobalAdmin;
  const canEditContabil =
    (hasContabilPermission && contabilPermission >= 1) || isGlobalAdmin;

  return {
    canViewContabil,
    canEditContabil,
    isReadOnlyContabil: canViewContabil && !canEditContabil,
  };
}
