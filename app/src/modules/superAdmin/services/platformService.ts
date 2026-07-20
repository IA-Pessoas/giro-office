import { api } from "@shared/services/apiClient";

import type {
  PlatformAuditRecord,
  PlatformOrganization,
  PlatformOrganizationsListResponse,
  PlatformOrganizationUser,
  PlatformSupportSession,
  PlatformUserDeleteResponse,
  PlatformUserMutationInput,
  PlatformUserSession,
  PlatformUsersListResponse,
} from "../types";

function unwrapData<T>(response: { data?: { data?: T } }): T {
  return response.data?.data as T;
}

export const platformService = {
  async login(input: { email: string; password: string }): Promise<PlatformUserSession> {
    const response = await api.post("/platform/session", input);
    return unwrapData<PlatformUserSession>(response);
  },

  async me(): Promise<Omit<PlatformUserSession, "token">> {
    const response = await api.get("/platform/me");
    return unwrapData<Omit<PlatformUserSession, "token">>(response);
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

  async listUsers(
    organizationId: string,
    params: { skip: number; take: number },
  ): Promise<PlatformUsersListResponse> {
    const response = await api.get(`/platform/organizations/${organizationId}/users`, { params });
    return unwrapData<PlatformUsersListResponse>(response);
  },

  async createUser(
    organizationId: string,
    input: PlatformUserMutationInput,
  ): Promise<PlatformOrganizationUser> {
    const response = await api.post(`/platform/organizations/${organizationId}/users`, input);
    return unwrapData<PlatformOrganizationUser>(response);
  },

  async updateUser(
    organizationId: string,
    userId: string,
    input: PlatformUserMutationInput,
  ): Promise<PlatformOrganizationUser> {
    const response = await api.patch(
      `/platform/organizations/${organizationId}/users/${userId}`,
      input,
    );
    return unwrapData<PlatformOrganizationUser>(response);
  },

  async deleteUser(
    organizationId: string,
    userId: string,
  ): Promise<PlatformUserDeleteResponse> {
    const response = await api.delete(`/platform/organizations/${organizationId}/users/${userId}`);
    return unwrapData<PlatformUserDeleteResponse>(response);
  },

  async startSupportSession(input: {
    organization_id: string;
    reason: string;
  }): Promise<PlatformSupportSession> {
    const response = await api.post("/platform/support-sessions", input);
    return unwrapData<PlatformSupportSession>(response);
  },

  async endSupportSession(): Promise<{ closed: boolean }> {
    const response = await api.delete("/platform/support-sessions/current");
    return unwrapData<{ closed: boolean }>(response);
  },

  async searchAudit(params: Record<string, string | number | undefined>): Promise<{
    items: PlatformAuditRecord[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const response = await api.get("/platform/audit/requests", { params });
    return unwrapData(response);
  },
};
