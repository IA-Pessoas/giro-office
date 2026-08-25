export interface PlatformOrganization {
  id: string;
  name: string;
  slug: string;
  status: string;
  subscription_plan: string;
  logo_url: string | null;
  cnpj: string;
  created_at: string;
  updated_at: string;
}

export interface PlatformOrganizationsListResponse {
  organizations: PlatformOrganization[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PlatformOrganizationUser {
  id: string;
  name: string;
  login: string;
  status: string;
  department_id: string;
  photo_url: string | null;
  type: "owner" | "admin" | "user" | null;
}

export interface PlatformUsersListResponse {
  users: PlatformOrganizationUser[];
  total: number;
  hasMore: boolean;
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
  durationMs?: number | null;
  serviceSource: string;
  createdAt: string;
}

export interface PlatformAuditListResponse {
  items: PlatformAuditRecord[];
  total: number;
  page: number;
  pageSize: number;
}
