import type { ContabilWorkerEnv } from "./env.js";

export type AuditParams = {
  userId: string;
  organizationId?: string | null;
  permission?: number | null;
  action: string;
  referring: string;
  referringId: string;
  changes: Record<string, unknown> | string;
};

export type AuditUpdateParams = Omit<AuditParams, "changes"> & {
  oldData: Record<string, unknown> | null;
  updatedData: Record<string, unknown>;
};

function payload(params: AuditParams): Record<string, unknown> {
  const now = new Date().toISOString();
  return {
    requestId: crypto.randomUUID(),
    organizationId: params.organizationId ?? null,
    userId: params.userId,
    permission: params.permission ?? null,
    method: "ENTITY_CHANGE",
    path: `/${params.referring.replace(/\./gu, "/")}`,
    outcome: "success",
    serviceSource: "contabil-service",
    createdAt: now,
    finishedAt: now,
    action: params.action,
    referring: params.referring,
    referringId: params.referringId,
    changes: params.changes,
  };
}

async function sendAudit(env: ContabilWorkerEnv, data: Record<string, unknown>): Promise<void> {
  if (!env.AUDIT_SERVICE || !env.AUDIT_SERVICE_TOKEN) return;
  try {
    await env.AUDIT_SERVICE.fetch(
      new Request("https://audit-service/internal/audit/requests", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-internal-service-token": env.AUDIT_SERVICE_TOKEN,
        },
        body: JSON.stringify(data),
      }),
    );
  } catch {
    // Auditoria segue best-effort, como no adapter Express atual.
  }
}

export function createContabilAudit(env: ContabilWorkerEnv) {
  return {
    createLog: async (params: AuditParams) => sendAudit(env, payload(params)),
    logUpdateIfChanged: async (params: AuditUpdateParams) => {
      const changes: Record<string, { from: unknown; to: unknown }> = {};
      for (const key of Object.keys(params.updatedData)) {
        const from = params.oldData?.[key];
        const to = params.updatedData[key];
        if (from !== to) changes[key] = { from, to };
      }
      await sendAudit(
        env,
        payload({
          userId: params.userId,
          organizationId: params.organizationId,
          permission: params.permission,
          action: params.action,
          referring: params.referring,
          referringId: params.referringId,
          changes,
        }),
      );
    },
  };
}
