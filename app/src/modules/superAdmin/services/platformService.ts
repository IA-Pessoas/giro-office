import { platformApi as api } from "@shared/services/api";

import type {
  CreatePlatformOrganizationPayload,
  PlatformAuditListResponse,
  PlatformDepartmentOption,
  PlatformOrganization,
  PlatformOrganizationsListResponse,
  PlatformOwnershipTransferResult,
  PlatformUsersListResponse,
  TransferPlatformOwnershipPayload,
  UpdatePlatformOrganizationLogoPayload,
  UpdatePlatformOrganizationPlanPayload,
  UpdatePlatformOrganizationStatusPayload,
} from "../types";
import type { AdminCreateUserData, UserItem } from "@modules/users/types";

function unwrapData<T>(response: { data?: { data?: T } }): T {
  return response.data?.data as T;
}

export const platformService = {
  async listOrganizations(params: {
    page: number;
    pageSize: number;
    status?: string;
    search?: string;
  }): Promise<PlatformOrganizationsListResponse> {
    const response = await api.get("/platform/organizations", { params });
    return unwrapData<PlatformOrganizationsListResponse>(response);
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
