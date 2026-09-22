import type { CreateAuditRequestPayload } from "@workspace/shared/audit";
import { INTERNAL_SERVICE_TOKEN_HEADER, REQUEST_ID_HEADER } from "@workspace/shared/http";
import { currentTaskContext } from "../context.js";

const AUDIT_REQUEST_URL = "https://audit-service.internal/internal/audit/requests";

export interface CreateLogParams {
  userId: string;
  organizationId?: string | null;
  permission?: number | null;
  action: string;
  referring: string;
  referringId: string;
  changes: Record<string, unknown> | string;
  required?: boolean;
}

export interface LogUpdateParams {
  userId: string;
  organizationId?: string | null;
  permission?: number | null;
  action: string;
  referring: string;
  referringId: string;
  oldData: Record<string, unknown> | null;
  updatedData: Record<string, unknown>;
  required?: boolean;
}

/**
 * Auditoria de entidade pelo binding `AUDIT_SERVICE`, com o mesmo payload do Node.
 * `required` falha a operação (o Node lança "Audit persistence unavailable"); o resto é
 * best-effort e só registra a falha.
 */
async function record(payload: CreateAuditRequestPayload, required: boolean): Promise<void> {
  const { env } = currentTaskContext();
  try {
    if (!env.AUDIT_SERVICE || !env.AUDIT_SERVICE_TOKEN) {
      throw new Error("AUDIT_SERVICE ou AUDIT_SERVICE_TOKEN ausente.");
    }
    const response = await env.AUDIT_SERVICE.fetch(
      new Request(AUDIT_REQUEST_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [INTERNAL_SERVICE_TOKEN_HEADER]: env.AUDIT_SERVICE_TOKEN,
          [REQUEST_ID_HEADER]: payload.requestId,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5_000),
      }),
    );
    if (!response.ok) throw new Error(`AUDIT_SERVICE respondeu ${response.status}.`);
  } catch (error) {
    console.error("[task-worker] falha ao enviar auditoria", {
      requestId: payload.requestId,
      referring: payload.referring,
      required,
      error: error instanceof Error ? error.message : "Erro desconhecido.",
    });
    if (required) throw new Error("Audit persistence unavailable");
  }
}

function payloadFor(
  params: Omit<CreateLogParams, "required">,
  changes: CreateAuditRequestPayload["changes"],
): CreateAuditRequestPayload {
  const now = new Date().toISOString();
  return {
    requestId: crypto.randomUUID(),
    organizationId: params.organizationId ?? null,
    userId: params.userId,
    permission: params.permission ?? null,
    method: "ENTITY_CHANGE",
    path: `/${params.referring.replace(/\./g, "/")}`,
    outcome: "success",
    serviceSource: "task-service",
    createdAt: now,
    finishedAt: now,
    action: params.action,
    referring: params.referring,
    referringId: params.referringId,
    changes,
  };
}

export async function createLog(params: CreateLogParams): Promise<void> {
  await record(payloadFor(params, params.changes), params.required === true);
}

export async function logUpdateIfChanged(params: LogUpdateParams): Promise<void> {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  if (params.oldData) {
    for (const key of Object.keys(params.updatedData)) {
      const oldVal = params.oldData[key];
      const newVal = params.updatedData[key];
      if (newVal !== oldVal) changes[key] = { from: oldVal, to: newVal };
    }
  }
  await record(
    payloadFor({ ...params, changes: {} }, Object.keys(changes).length > 0 ? changes : {}),
    params.required === true,
  );
}
