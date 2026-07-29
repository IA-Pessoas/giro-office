import type { ModulePermissions } from "./modules.js";

export type AuthUserType = "owner" | "admin" | "user";
export type AuthSpecialPolicy = "manageUsers" | "ownerOnly";

export interface AuthIdentity {
  user_id: string;
  organization_id?: string;
  permission?: number;
  modules?: ModulePermissions;
  modulePermissionsPresent?: boolean;
  session_version?: number;
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
  anyOf?: AuthPolicy[];
  minPermission?: number;
  modulePermission?: AuthModulePolicy;
  anyModulePermission?: AuthAnyModulePolicy;
  special?: AuthSpecialPolicy;
}
