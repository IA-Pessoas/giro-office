import type { UserItem } from "../types";
import { userService } from "./userService";

export type AdminUserStatus = "active" | "inactive";

export const ADMIN_USER_STATUS_LABELS: Record<AdminUserStatus, string> = {
  active: "Ativo",
  inactive: "Inativo",
};

export function normalizeAdminUserStatus(status: string | null | undefined): AdminUserStatus | null {
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

export function filterAdminUsersByStatus(users: UserItem[], status?: AdminUserStatus): UserItem[] {
  if (!status) {
    return users;
  }

  return users.filter((user) => normalizeAdminUserStatus(user.status) === status);
}

export async function listAdminUsers(status?: AdminUserStatus): Promise<UserItem[]> {
  const users = await userService.list();
  return filterAdminUsersByStatus(users, status);
}
