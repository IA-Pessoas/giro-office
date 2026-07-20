export type PlatformRole = "super_admin";

export interface PlatformUserSession {
  id: string;
  name: string;
  email: string;
  platform_role: PlatformRole;
  token: string;
}

export interface PlatformOrganization {
  id: string;
  name: string;
  slug: string;
  status: string;
  subscription_plan: string;
  logo_url?: string | null;
  cnpj: string;
  email_created_by: string;
  created_at: string;
  updated_at?: string;
}

export interface PlatformOrganizationsListResponse {
  organizations: PlatformOrganization[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PlatformSupportSession {
  support_session_id: string;
  organization_id: string;
  reason: string;
  token: string;
  expires_at: string;
}

export interface PlatformOrganizationUser {
  id: string;
  name: string;
  login?: string | null;
  email?: string | null;
  department_id?: string | null;
  permission?: number | null;
  type?: string | null;
  status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface PlatformUsersListResponse {
  users: PlatformOrganizationUser[];
  total: number;
  skip?: number;
  take?: number;
}

export type PlatformUserMutationInput = Record<string, unknown>;

export interface PlatformUserDeleteResponse {
  message: string;
}

export interface PlatformAuditRecord {
  id: string;
  requestId: string;
  organizationId?: string | null;
  userId?: string | null;
  method: string;
  path: string;
  statusCode?: number | null;
  outcome: "success" | "error" | "aborted";
  serviceSource: string;
  createdAt: string;
  metadata?: Record<string, unknown> | null;
}
