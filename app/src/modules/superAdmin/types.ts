export type PlatformOrganizationStatus =
  | "trial"
  | "past_due"
  | "active"
  | "suspended"
  | "cancelled";
export type PlatformOrganizationPlan = "trial" | "pro" | "enterprise";

export interface PlatformOrganization {
  id: string;
  name: string;
  slug: string;
  status: PlatformOrganizationStatus;
  subscription_plan: PlatformOrganizationPlan;
  logo_url: string | null;
  cnpj: string;
  created_at: string;
  updated_at: string;
}

export interface CreatePlatformOrganizationPayload {
  name: string;
  cnpj: string;
}

export interface UpdatePlatformOrganizationStatusPayload {
  status: PlatformOrganizationStatus;
  expected_updated_at: string;
}

export interface UpdatePlatformOrganizationPlanPayload {
  subscription_plan: PlatformOrganizationPlan;
  expected_updated_at: string;
}

export interface UpdatePlatformOrganizationLogoPayload {
  logo_url: string | null;
  expected_updated_at: string;
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

export interface PlatformDepartmentOption {
  id: string;
  name: string;
}

export interface PlatformAuditRecord {
  id: string;
  requestId: string;
  organizationId?: string | null;
  method: string;
  path: string;
  statusCode?: number | null;
  outcome: "success" | "error" | "aborted";
  durationMs?: number | null;
  serviceSource: string;
  createdAt: string;
  action?: string | null;
  referring?: string | null;
  referringId?: string | null;
  actorPlatformUserId?: string;
  changes?: {
    status?: { from: PlatformOrganizationStatus | null; to: PlatformOrganizationStatus | null };
    subscription_plan?: {
      from: PlatformOrganizationPlan | null;
      to: PlatformOrganizationPlan | null;
    };
    logo_url?: { from: string | null; to: string | null };
  };
}

export interface PlatformAuditListResponse {
  items: PlatformAuditRecord[];
  total: number;
  page: number;
  pageSize: number;
}
