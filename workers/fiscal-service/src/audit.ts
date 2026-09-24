import { ServiceError } from "@workspace/shared/http";
import type { FiscalWorkerEnv } from "./env.js";

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

export type FiscalAudit = {
  createLog(params: AuditParams): Promise<void>;
  logUpdateIfChanged(params: AuditUpdateParams): Promise<void>;
};

const AUDIT_TIMEOUT_MS = 5_000;

/** Binding ausente falha explícito antes de qualquer escrita, em vez de perder a auditoria. */
export function requireAuditConfigured(env: FiscalWorkerEnv): void {
  if (!env.AUDIT_SERVICE || !env.AUDIT_SERVICE_TOKEN) {
    throw new ServiceError(503, "Auditoria externa não configurada.");
  }
}

function payload(params: AuditParams): Record<string, unknown> {
  const now = new Date().toISOString();
  return {
    requestId: crypto.randomUUID(),
    organizationId: params.organizationId ?? null,
    userId: params.userId,
    permission: params.permission ?? null,
    method: "ENTITY_CHANGE",
    path: `/${params.referring.replace(/\./g, "/")}`,
    outcome: "success",
    serviceSource: "fiscal-service",
    createdAt: now,
    finishedAt: now,
    action: params.action,
    referring: params.referring,
    referringId: params.referringId,
    changes: params.changes,
  };
}

// ponytail: tentativa única com timeout; o recorder Node faz retry em background.
// Adicionar fila/waitUntil se a perda de auditoria por falha transitória virar problema.
async function sendAudit(env: FiscalWorkerEnv, data: Record<string, unknown>): Promise<void> {
  const binding = env.AUDIT_SERVICE;
  const token = env.AUDIT_SERVICE_TOKEN;
  if (!binding || !token) throw new ServiceError(503, "Auditoria externa não configurada.");
  try {
    const response = await binding.fetch(
      new Request("https://audit-service/internal/audit/requests", {
        method: "POST",
        headers: { "content-type": "application/json", "x-internal-service-token": token },
        body: JSON.stringify(data),
        signal: AbortSignal.timeout(AUDIT_TIMEOUT_MS),
      }),
    );
    if (!response.ok) {
      console.error({
        event: "fiscal.audit.failed",
        status: response.status,
        requestId: data.requestId,
      });
    }
  } catch (error) {
    // Paridade com o recorder público do Node: a entidade já foi persistida; registra e segue.
    console.error({
      event: "fiscal.audit.failed",
      requestId: data.requestId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function createFiscalAudit(env: FiscalWorkerEnv): FiscalAudit {
  return {
    createLog: async (params) => sendAudit(env, payload(params)),
    logUpdateIfChanged: async (params) => {
      const changes: Record<string, { from: unknown; to: unknown }> = {};
      if (params.oldData) {
        for (const key of Object.keys(params.updatedData)) {
          const from = params.oldData[key];
          const to = params.updatedData[key];
          if (from !== to) changes[key] = { from, to };
        }
      }
      const { oldData: _old, updatedData: _updated, ...rest } = params;
      await sendAudit(env, payload({ ...rest, changes }));
    },
  };
}
