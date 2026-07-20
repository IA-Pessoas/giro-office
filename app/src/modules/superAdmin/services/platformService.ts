import { api } from "@shared/services/apiClient";

import type {
  PlatformAuditRecord,
  PlatformOrganization,
  PlatformSupportSession,
  PlatformUserSession,
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
  }): Promise<{ organizations: PlatformOrganization[]; total: number; page: number; pageSize: number }> {
    const response = await api.get("/platform/organizations", { params });
    return unwrapData(response);
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
