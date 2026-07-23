export type AuthUserType = "owner" | "admin" | "user";
export type AuthSpecialPolicy = "manageUsers" | "ownerOnly";

export interface AuthIdentity {
  user_id: string;
  organization_id?: string;
  permission?: number;
  modules?: Record<string, number | null>;
  type?: AuthUserType;
  name?: string;
  login?: string;
  [key: string]: unknown;
}

export interface AuthContext {
  token: string;
  userId: string;
  organizationId: string;
  claims: AuthIdentity;
}

export interface AuthModulePolicy {
  module: string;
  minPermission: number;
}

export interface AuthAnyModulePolicy {
  modules: string[];
  minPermission: number;
}

export interface AuthPolicy {
  minPermission?: number;
  modulePermission?: AuthModulePolicy;
  anyModulePermission?: AuthAnyModulePolicy;
  special?: AuthSpecialPolicy;
}
