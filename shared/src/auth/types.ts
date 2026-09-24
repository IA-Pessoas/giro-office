import type { ModulePermissions } from "./modules.js";

export type AuthUserType = "owner" | "admin" | "user";
export type AuthKind = "organization" | "platform";
export type PlatformRole = "super_admin";
export type AuthSpecialPolicy = "impersonationOnly" | "manageUsers" | "ownerOnly" | "platformOnly";

export interface AuthIdentity {
  user_id: string;
  organization_id?: string;
  permission?: number;
  modules?: ModulePermissions;
  modulePermissionsPresent?: boolean;
  session_version?: number;
  session_id?: string;
  csrf_hash?: string;
  impersonator_platform_user_id?: string;
  type?: AuthUserType;
  auth_kind?: AuthKind;
  platform_role?: PlatformRole;
  name?: string;
  login?: string;
  [key: string]: unknown;
}

export interface AuthContext {
  token: string;
  userId: string;
  organizationId: string;
  actorKind: AuthKind;
  isPlatformAdmin: boolean;
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
  anyOf?: readonly AuthPolicy[];
  special?: AuthSpecialPolicy;
}
