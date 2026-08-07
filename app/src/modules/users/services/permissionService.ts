import { setupAPIClient } from "@shared/services/api";

import type { PermissionDraft } from "../types";

interface PermissionServiceRequestOptions {
  signal?: AbortSignal;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractPermissionPayload(payload: unknown): Record<string, unknown> {
  if (!isRecord(payload)) {
    return {};
  }

  // Suporte a multiplos formatos historicos do backend.
  if (isRecord(payload.permission)) {
    return payload.permission;
  }

  if (isRecord(payload.data)) {
    if (isRecord(payload.data.permission)) {
      return payload.data.permission;
    }

    return payload.data;
  }

  return payload;
}

export const permissionService = {
  getByUserId: async (
    userId: string,
    modulo?: string,
    options?: PermissionServiceRequestOptions,
  ): Promise<Record<string, unknown>> => {
    const api = setupAPIClient();
    const response = await api.get(`/user/permission/${userId}`, {
      params: modulo ? { modulo } : undefined,
      signal: options?.signal,
    });

    return extractPermissionPayload(response.data);
  },

  update: async (userId: string, payload: PermissionDraft): Promise<Record<string, unknown>> => {
    const api = setupAPIClient();
    const response = await api.put(`/user/permission/${userId}`, payload);

    return extractPermissionPayload(response.data);
  },
};
