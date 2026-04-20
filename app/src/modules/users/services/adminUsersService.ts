import { isAxiosError } from "axios";

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

const ADMIN_USERS_PAGE_SIZE = 100;

function shouldFallbackToFrontendStatusFilter(error: unknown): boolean {
  if (!isAxiosError(error)) {
    return false;
  }

  const statusCode = error.response?.status;

  return statusCode === 400 || statusCode === 404 || statusCode === 422;
}

async function listAllAdminUsers(filters?: { status?: AdminUserStatus }): Promise<UserItem[]> {
  const allUsers: UserItem[] = [];
  let skip = 0;

  while (true) {
    const page = await userService.listPage({
      skip,
      take: ADMIN_USERS_PAGE_SIZE,
      ...filters,
    });

    allUsers.push(...page.users);

    if (page.users.length < ADMIN_USERS_PAGE_SIZE) {
      break;
    }

    if (page.total !== null && allUsers.length >= page.total) {
      break;
    }

    skip += ADMIN_USERS_PAGE_SIZE;
  }

  return allUsers;
}

export async function listAdminUsers(status?: AdminUserStatus): Promise<UserItem[]> {
  if (!status) {
    return listAllAdminUsers();
  }

  try {
    return await listAllAdminUsers({ status });
  } catch (error) {
    if (!shouldFallbackToFrontendStatusFilter(error)) {
      throw error;
    }
  }

  const users = await listAllAdminUsers();
  return filterAdminUsersByStatus(users, status);
}
