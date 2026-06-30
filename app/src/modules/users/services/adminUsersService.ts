import type { UserItem } from "../types";
import { userService } from "./userService";
import {
  ADMIN_USER_STATUS_LABELS,
  collectAdminUsersFromPages,
  filterAdminUsersByStatus,
  getAdminUserStatusLabel,
  normalizeAdminUserStatus,
  type AdminUserStatus,
} from "./adminUsersService.helpers";

export {
  ADMIN_USER_STATUS_LABELS,
  filterAdminUsersByStatus,
  getAdminUserStatusLabel,
  normalizeAdminUserStatus,
  type AdminUserStatus,
};

export async function listAdminUsers(status?: AdminUserStatus): Promise<UserItem[]> {
  return collectAdminUsersFromPages({
    status,
    listPage: (params) => userService.listPage(params),
  });
}
