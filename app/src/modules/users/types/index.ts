export interface UserItem {
  id: string;
  name: string;
  login: string;
  permission: number;
  department_id: string;
  status: string;
  photo?: string | null;
  photo_url?: string | null;
  department?: {
    name: string;
    color: string;
  };
}

export type UserType = "user" | "admin" | "owner";
export type UserPermission = 0 | 1 | 2;

export interface CreateUserData {
  name: string;
  login: string;
  password: string;
  department_id: string;
  permission: UserPermission;
  organization_id?: string;
  type?: UserType;
  status?: string;
  invited_by?: string;
  first_owner_flag?: boolean;
  modules?: Record<string, number | null>;
}

export interface AdminCreateUserData extends CreateUserData {
  organization_id: string;
  type: UserType;
  status: string;
}

export interface UpdateUserData {
  name?: string;
  password?: string;
  permission?: number;
  department_id?: string;
  status?: string;
  file?: File;
}
