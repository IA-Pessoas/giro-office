import type {
  AdminCreateUserData,
  PermissionDraft,
  UpdateUserData,
  UserItem,
} from "./index";

export interface CreateAdminUserHandler {
  (payload: AdminCreateUserData): Promise<UserItem>;
}

export interface AdminUserDetailsDataSource {
  loadUser: (userId: string) => Promise<UserItem>;
  saveUser: (userId: string, payload: UpdateUserData) => Promise<UserItem>;
  resetPassword: (userId: string, password: string) => Promise<void>;
}

export interface AdminUserPermissionsDataSource {
  listUsers: () => Promise<ReadonlyArray<UserItem>>;
  loadPermissions: (userId: string, signal?: AbortSignal) => Promise<Record<string, unknown>>;
  savePermissions: (userId: string, payload: PermissionDraft) => Promise<Record<string, unknown>>;
  syncDepartmentPermission: (
    userId: string,
    payload: Pick<UpdateUserData, "permission" | "type" | "modules">,
  ) => Promise<void>;
}
