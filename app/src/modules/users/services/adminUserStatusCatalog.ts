export const ADMIN_USER_STATUS_LABELS = {
  active: "Ativo",
  inactive: "Inativo",
} as const;

export type AdminUserStatus = keyof typeof ADMIN_USER_STATUS_LABELS;

export function normalizeAdminUserStatus(
  status: string | null | undefined,
): AdminUserStatus | null {
  if (status === "active" || status === "inactive") {
    return status;
  }

  if (status === "Ativo") {
    return "active";
  }

  if (status === "Inativo") {
    return "inactive";
  }

  return null;
}

export function getAdminUserStatusLabel(status: string | null | undefined): string {
  const normalizedStatus = normalizeAdminUserStatus(status);

  if (!normalizedStatus) {
    return status ?? "";
  }

  return ADMIN_USER_STATUS_LABELS[normalizedStatus];
}
