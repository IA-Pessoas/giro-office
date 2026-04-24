import { setupAPIClient } from "@shared/services/api";
import type {
  Organization,
  OrganizationCreatePayload,
  OrganizationItem,
  UpdateOrganizationData,
} from "../types";

function unwrapApiData<T>(body: unknown): T {
  if (body !== null && typeof body === "object" && "data" in body) {
    return (body as { data: T }).data;
  }
  return body as T;
}

export const organizationService = {
  list: async (filters?: { status?: string }): Promise<OrganizationItem[]> => {
    const api = setupAPIClient();
    const response = await api.get("/organizations", { params: filters });
    return unwrapApiData<OrganizationItem[]>(response.data);
  },

  getById: async (id: string): Promise<Organization> => {
    const api = setupAPIClient();
    const response = await api.get("/organizations", {
      params: { id },
    });
    return unwrapApiData<Organization>(response.data);
  },

  create: async (data: OrganizationCreatePayload): Promise<Organization> => {
    const api = setupAPIClient();
    const response = await api.post("/organizations", data);
    return unwrapApiData<Organization>(response.data);
  },

  update: async (id: string, data: UpdateOrganizationData): Promise<Organization> => {
    const api = setupAPIClient();
    const response = await api.put("/organizations", {
      id,
      ...data,
    });
    return unwrapApiData<Organization>(response.data);
  },
};
