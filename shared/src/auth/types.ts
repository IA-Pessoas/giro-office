export type AuthUserType = "owner" | "admin" | "user";
export type AuthKind = "organization" | "platform";
export type PlatformRole = "super_admin";
export type AuthSpecialPolicy = "manageUsers" | "ownerOnly" | "platformOnly";

export interface AuthIdentity {
  user_id: string;
  organization_id?: string;
  permission?: number;
  modules?: Record<string, number | null>;
  type?: AuthUserType;
  auth_kind?: AuthKind;
  platform_role?: PlatformRole;
  support_mode?: boolean;
  support_session_id?: string;
  support_organization_id?: string;
  name?: string;
  login?: string;
  [key: string]: unknown;
}

export interface AuthContext {
  token: string;
  userId: string;
  organizationId: string;
  claims: AuthIdentity;
  actorKind: AuthKind;
  isPlatformAdmin: boolean;
  isSupportMode: boolean;
  supportOrganizationId?: string;
  supportSessionId?: string;
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
