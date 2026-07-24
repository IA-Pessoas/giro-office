import type { UserItem } from "../types";

export const ADMIN_USER_STATUS_LABELS = {
  active: "Ativo",
  inactive: "Inativo",
} as const;

export const ADMIN_USERS_PAGE_SIZE = 100;

export type AdminUserStatus = keyof typeof ADMIN_USER_STATUS_LABELS;

export interface AdminUsersListPageParams {
  skip: number;
  take: number;
}

interface UsersListPageLike {
  users: UserItem[];
  total: number | null;
}

interface CollectAdminUsersFromPagesParams {
  status?: AdminUserStatus;
  listPage: (params: AdminUsersListPageParams) => Promise<UsersListPageLike>;
}

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

export function filterAdminUsersByStatus(
  users: UserItem[],
  status?: AdminUserStatus,
): UserItem[] {
  if (!status) {
    return users;
  }

  return users.filter((user) => normalizeAdminUserStatus(user.status) === status);
}

export function buildAdminUsersListPageParams(skip: number): AdminUsersListPageParams {
  return {
    skip,
    take: ADMIN_USERS_PAGE_SIZE,
  };
}

export async function collectAdminUsersFromPages({
  status,
  listPage,
}: CollectAdminUsersFromPagesParams): Promise<UserItem[]> {
  const allUsers: UserItem[] = [];
  let skip = 0;

  while (true) {
    const page = await listPage(buildAdminUsersListPageParams(skip));

    allUsers.push(...page.users);

    if (page.users.length < ADMIN_USERS_PAGE_SIZE) {
      break;
    }

    if (page.total !== null && allUsers.length >= page.total) {
      break;
    }

    skip += ADMIN_USERS_PAGE_SIZE;
  }

  return filterAdminUsersByStatus(allUsers, status);
}
