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
  permission: number;
  version: number;
}

export interface UpdatePlatformOrganizationUserPayload {
  name?: string;
  login?: string;
  password?: string;
  department_id?: string;
  permission?: number;
  status?: "active" | "inactive";
  expected_version: number;
}

export type PreviousOwnerAction = "demote" | "deactivate";

export interface TransferPlatformOwnershipPayload {
  currentOwnerId: string;
  successorUserId: string;
  previousOwnerAction: PreviousOwnerAction;
  justification: string;
}

export interface PlatformOwnershipTransferResult {
  currentOwner: PlatformOrganizationUser;
  successor: PlatformOrganizationUser;
}

export interface PlatformUsersListResponse {
  users: PlatformOrganizationUser[];
  total: number;
  hasMore: boolean;
}

export interface PlatformSuperAdmin {
  id: string;
  name: string;
  email: string;
  status: string;
  can_impersonate: boolean;
}

export interface UpdatePlatformSuperAdminPermissionPayload {
  can_impersonate: boolean;
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
  actorPlatformUserName?: string;
  organizationName?: string;
  changes?: {
    status?: { from: PlatformOrganizationStatus | null; to: PlatformOrganizationStatus | null };
    subscription_plan?: {
      from: PlatformOrganizationPlan | null;
      to: PlatformOrganizationPlan | null;
    };
    logo_url?: { from: string | null; to: string | null };
    ownership?: {
      before: { ownerId: string; type: "owner"; status: "active" };
      after: {
        ownerId: string;
        type: "owner";
        status: "active";
        previousOwner: { id: string; type: "owner" | "admin"; status: "active" | "inactive" };
      };
      previousOwnerAction: "demote" | "deactivate";
      justification: string;
    };
    modules?: {
      before: Partial<Record<string, 0 | 1 | 2 | 3>>;
      after: Partial<Record<string, 0 | 1 | 2 | 3>>;
    };
    can_impersonate?: { from: boolean; to: boolean };
  };
}

export interface PlatformAuditListResponse {
  items: PlatformAuditRecord[];
  total: number;
  page: number;
  pageSize: number;
}
