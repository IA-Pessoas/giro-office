import type { UserWorkerEnv } from "./env.js";

export interface UserAuditParams {
  actorUserId?: string;
  platformActorUserId?: string;
  organizationId: string | null;
  action: string;
  referring: string;
  referringId: string;
  changes: Record<string, unknown>;
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
    if (!env.AUDIT_SERVICE) return;
    try {
      await env.AUDIT_SERVICE.fetch(
        new Request("https://audit-service/internal/audit/requests", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(env.AUDIT_SERVICE_TOKEN
              ? { "x-internal-service-token": env.AUDIT_SERVICE_TOKEN }
              : {}),
          },
          body: JSON.stringify(payload(params)),
        }),
      );
    } catch {
      // Auditoria permanece best-effort, como no serviço Node legado.
    }
  };
}
