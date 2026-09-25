import { ServiceError } from "@workspace/shared/http";

import type { UserWorkerEnv } from "./env.js";

export interface UserAuditParams {
  actorUserId?: string;
  platformActorUserId?: string;
  organizationId: string | null;
  action: string;
  referring: string;
  referringId: string;
  changes: Record<string, unknown>;
  /** Evento obrigatório (personificação): falha de envio lança em vez de só avisar. */
  required?: boolean;
}

export type UserAuditRecorder = (params: UserAuditParams) => Promise<void>;

function payload(params: UserAuditParams): Record<string, unknown> {
  const now = new Date().toISOString();
  return {
    requestId: crypto.randomUUID(),
    organizationId: params.organizationId,
    ...(params.actorUserId ? { userId: params.actorUserId } : {}),
    method: "ENTITY_CHANGE",
    path: `/${params.referring}`,
    outcome: "success",
    serviceSource: "user-service",
    createdAt: now,
    finishedAt: now,
    action: params.action,
    referring: params.referring,
    referringId: params.referringId,
    changes: params.changes,
    ...(params.platformActorUserId
      ? { metadata: { actorPlatformUserId: params.platformActorUserId } }
      : {}),
  };
}

export function createUserAudit(env: UserWorkerEnv): UserAuditRecorder {
  return async (params) => {
    const fail = (message: string, error?: unknown) => {
      if (params.required) throw new ServiceError(503, "Auditoria indisponível.", error);
      console.warn(message, ...(error === undefined ? [] : [error]));
    };
    if (!env.AUDIT_SERVICE) {
      return fail("[user-service] AUDIT_SERVICE binding ausente; auditoria não foi enviada.");
    }
    if (!env.AUDIT_SERVICE_TOKEN) {
      return fail("[user-service] AUDIT_SERVICE_TOKEN ausente; auditoria não foi enviada.");
    }
    try {
      const response = await env.AUDIT_SERVICE.fetch(
        new Request("https://audit-service/internal/audit/requests", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-internal-service-token": env.AUDIT_SERVICE_TOKEN,
          },
          body: JSON.stringify(payload(params)),
        }),
      );
      if (!response.ok) {
        fail(`[user-service] AUDIT_SERVICE respondeu ${response.status}; auditoria falhou.`);
      }
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      fail("[user-service] falha ao comunicar com AUDIT_SERVICE; auditoria falhou.", error);
    }
  };
}
