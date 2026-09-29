import { platformApi as api } from "@shared/services/api";

import type {
  CreatePlatformOrganizationPayload,
  PlatformAuditListResponse,
  PlatformDepartmentOption,
  PlatformOrganization,
  PlatformOrganizationsListResponse,
  PlatformOwnershipTransferResult,
  PlatformSuperAdmin,
  PlatformUsersListResponse,
  TransferPlatformOwnershipPayload,
  UpdatePlatformSuperAdminPermissionPayload,
  UpdatePlatformOrganizationUserPayload,
  UpdatePlatformOrganizationLogoPayload,
  UpdatePlatformOrganizationPlanPayload,
  UpdatePlatformOrganizationStatusPayload,
} from "../types";
import type { AdminCreateUserData, PermissionDraft, UserItem } from "@modules/users/types";

function unwrapData<T>(response: { data?: { data?: T } }): T {
  return response.data?.data as T;
}

export type MarketingReconciliationDataset =
  | "eventos"
  | "eventos_edicoes"
  | "eventos_feedbacks_periodos"
  | "eventos_feedbacks"
  | "redes_sociais"
  | "senhas"
  | "ai_usage";

export interface MarketingMigrationReconciliation {
  organizationId: string;
  lastRunAt: string | null;
  datasets: Array<{
    dataset: MarketingReconciliationDataset;
    status: string;
    totals: { prepared: number; imported: number; quarantined: number } | null;
    items: Array<{
      sourceTable: string;
      sourceIdentityDigest: string;
      stepId: string;
      field: string | null;
      reasonCode: string;
      resolution: { canonicalTargetId: string; actorId: string; createdAt: string } | null;
    }>;
    decisions: Array<{
      sourceTable: string;
      sourceIdentityDigest: string;
      stepId: string;
      canonicalTargetId: string;
      actorId: string;
      createdAt: string;
    }>;
  }>;
}

export interface MarketingCanonicalEvent {
  id: string;
  name: string;
}

export const platformService = {
  async getMarketingMigrationReconciliation(
    organizationId: string,
  ): Promise<MarketingMigrationReconciliation> {
    const response = await api.get("/platform/marketing/migration-reconciliation", {
      params: { organizationId },
    });
    return unwrapData<MarketingMigrationReconciliation>(response);
  },

  async listMarketingCanonicalEvents(organizationId: string): Promise<MarketingCanonicalEvent[]> {
    const response = await api.get("/platform/marketing/migration-reconciliation/targets", {
      params: { organizationId },
    });
    return unwrapData<{ events: MarketingCanonicalEvent[] }>(response).events;
  },

  async resolveMarketingMigrationAssociation(
    dataset: "eventos_edicoes",
    payload: {
      organizationId: string;
      sourceTable: "tb_mkt.eventos_edicoes";
      sourceIdentityDigest: string;
      stepId: string;
      canonicalTargetId: string;
    },
  ): Promise<{ id: string; createdAt: string }> {
    const response = await api.post(
      `/platform/marketing/migration-reconciliation/${dataset}/resolve`,
      payload,
    );
    return unwrapData<{ id: string; createdAt: string }>(response);
  },

  async reconcileMarketingMigration(
    dataset: MarketingReconciliationDataset,
    organizationId: string,
  ): Promise<{ dataset: string; data: { runId: string; complete: boolean } }> {
    const response = await api.post(
      `/platform/marketing/migration-reconciliation/${dataset}/reconcile`,
      { organizationId },
    );
    return unwrapData<{ dataset: string; data: { runId: string; complete: boolean } }>(response);
  },

  async listOrganizations(params: {
    page: number;
    pageSize: number;
    status?: string;
    search?: string;
  }): Promise<PlatformOrganizationsListResponse> {
    const response = await api.get("/platform/organizations", { params });
    return unwrapData<PlatformOrganizationsListResponse>(response);
  },

  async listSuperAdmins(): Promise<PlatformSuperAdmin[]> {
    const response = await api.get("/platform/super-admins");
    return unwrapData<PlatformSuperAdmin[]>(response);
  },

  async updateSuperAdminImpersonationPermission(
    superAdminId: string,
    payload: UpdatePlatformSuperAdminPermissionPayload,
  ): Promise<PlatformSuperAdmin> {
    const response = await api.patch(
      `/platform/super-admins/${superAdminId}/impersonation-permission`,
      payload,
    );
    return unwrapData<PlatformSuperAdmin>(response);
  },

  async listUsers(
    organizationId: string,
    params: { skip: number; take: number; search?: string },
  ): Promise<PlatformUsersListResponse> {
    const response = await api.get(`/platform/organizations/${organizationId}/users`, { params });
    return unwrapData<PlatformUsersListResponse>(response);
  },

  async getUser(organizationId: string, userId: string): Promise<PlatformUsersListResponse["users"][number]> {
    const response = await api.get(`/platform/organizations/${organizationId}/users/${userId}`);
    return unwrapData<PlatformUsersListResponse["users"][number]>(response);
  },

  async getUserPermissions(
    organizationId: string,
    userId: string,
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>> {
    const response = await api.get(
      `/platform/organizations/${organizationId}/users/${userId}/permissions`,
      { signal },
    );
    return unwrapData<Record<string, unknown>>(response);
  },

  async updateUserPermissions(
    organizationId: string,
    userId: string,
    permissions: PermissionDraft,
  ): Promise<Record<string, unknown>> {
    const response = await api.put(
      `/platform/organizations/${organizationId}/users/${userId}/permissions`,
      permissions,
    );
    return unwrapData<Record<string, unknown>>(response);
  },

  async deactivateUser(
    organizationId: string,
    userId: string,
  ): Promise<PlatformUsersListResponse["users"][number]> {
    const response = await api.delete(`/platform/organizations/${organizationId}/users/${userId}`);
    return unwrapData<PlatformUsersListResponse["users"][number]>(response);
  },

  async reactivateUser(
    organizationId: string,
    userId: string,
  ): Promise<PlatformUsersListResponse["users"][number]> {
    const response = await api.post(
      `/platform/organizations/${organizationId}/users/${userId}/reactivate`,
    );
    return unwrapData<PlatformUsersListResponse["users"][number]>(response);
  },

  async resetPassword(organizationId: string, userId: string, password: string): Promise<void> {
    await api.post(`/platform/organizations/${organizationId}/users/${userId}/password-reset`, {
      password,
    });
  },

  async startImpersonation(organizationId: string, userId: string): Promise<void> {
    await api.post(
      `/platform/organizations/${organizationId}/users/${userId}/impersonate`,
    );
  },

  async transferOwnership(
    organizationId: string,
    data: TransferPlatformOwnershipPayload,
  ): Promise<PlatformOwnershipTransferResult> {
    const response = await api.post(
      `/platform/organizations/${organizationId}/ownership-transfer`,
      data,
    );
    return unwrapData<PlatformOwnershipTransferResult>(response);
  },

  async updateUser(
    organizationId: string,
    userId: string,
    data: UpdatePlatformOrganizationUserPayload,
  ): Promise<PlatformUsersListResponse["users"][number]> {
    const response = await api.patch(
      `/platform/organizations/${organizationId}/users/${userId}`,
      data,
    );
    return unwrapData<PlatformUsersListResponse["users"][number]>(response);
  },

  async listDepartments(organizationId: string): Promise<PlatformDepartmentOption[]> {
    const response = await api.get(`/platform/organizations/${organizationId}/departments`);
    return unwrapData<PlatformDepartmentOption[]>(response);
  },

  async createUser(organizationId: string, data: AdminCreateUserData): Promise<UserItem> {
    const { organization_id: _organizationId, ...payload } = data;
    const response = await api.post(`/platform/organizations/${organizationId}/users`, payload);
    return unwrapData<UserItem>(response);
  },

  async getOrganization(organizationId: string): Promise<PlatformOrganization> {
    const response = await api.get(`/platform/organizations/${organizationId}`);
    return unwrapData<PlatformOrganization>(response);
  },

  async createOrganization(data: CreatePlatformOrganizationPayload): Promise<PlatformOrganization> {
    const response = await api.post("/platform/organizations", data);
    return unwrapData<PlatformOrganization>(response);
  },

  async updateStatus(
    organizationId: string,
    data: UpdatePlatformOrganizationStatusPayload,
  ): Promise<PlatformOrganization> {
    const response = await api.patch(`/platform/organizations/${organizationId}/status`, data);
    return unwrapData<PlatformOrganization>(response);
  },

  async updateSubscriptionPlan(
    organizationId: string,
    data: UpdatePlatformOrganizationPlanPayload,
  ): Promise<PlatformOrganization> {
    const response = await api.patch(
      `/platform/organizations/${organizationId}/subscription-plan`,
      data,
    );
    return unwrapData<PlatformOrganization>(response);
  },

  async updateLogoUrl(
    organizationId: string,
    data: UpdatePlatformOrganizationLogoPayload,
  ): Promise<PlatformOrganization> {
    const response = await api.patch(`/platform/organizations/${organizationId}/logo-url`, data);
    return unwrapData<PlatformOrganization>(response);
  },

  async searchAudit(params: {
    page: number;
    pageSize: number;
    path?: string;
    organizationId?: string;
  }): Promise<PlatformAuditListResponse> {
    const response = await api.get("/platform/audit/requests", { params });
    return unwrapData<PlatformAuditListResponse>(response);
  },
};
