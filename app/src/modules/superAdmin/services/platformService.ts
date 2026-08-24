import { platformApi as api } from "@shared/services/api";

import type {
  PlatformAuditListResponse,
  PlatformOrganizationsListResponse,
  PlatformUsersListResponse,
} from "../types";

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

  async searchAudit(params: {
    page: number;
    pageSize: number;
    path?: string;
  }): Promise<PlatformAuditListResponse> {
    const response = await api.get("/platform/audit/requests", { params });
    return unwrapData<PlatformAuditListResponse>(response);
  },
};
