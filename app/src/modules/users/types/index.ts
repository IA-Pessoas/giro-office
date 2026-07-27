export interface UserItem {
  id: string;
  name: string;
  login: string;
  permission: number;
  department_id: string;
  status: string;
  photo?: string | null;
  photo_url?: string | null;
  type?: UserType | null;
  first_owner_flag?: boolean;
  permission_id?: string | null;
  department?: {
    name: string;
    color: string;
  };
}

export type UserType = "user" | "admin" | "owner";
export type UserPermission = -1 | 0 | 1 | 2;

export type KnownPermissionModuleKey =
  | "certificado"
  | "contabil"
  | "fiscal"
  | "integracao"
  | "pessoal"
  | "regularize"
  | "rh"
  | "ti"

export type KnownPermissionRecord = Record<KnownPermissionModuleKey, number | null>;
export type PermissionDraft = Record<string, number | null>;

export interface PermissionNormalizationResult {
  known: KnownPermissionRecord;
  extras: PermissionDraft;
  missingKnownKeys: KnownPermissionModuleKey[];
  invalidExtraKeys: string[];
}

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
  type?: UserType;
  department_id?: string;
  status?: string;
  file?: File;
  modules?: Record<string, number | null>;
}
