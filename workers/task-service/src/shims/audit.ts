import type {
  CreateLogParams,
  LogUpdateParams,
} from "@workspace/task-service/src/integrations/audit.js";
import { currentTaskContext } from "../context.js";
import { getTaskServiceEnv } from "./env.js";

export type { CreateLogParams, LogUpdateParams };

type AuditParams = Omit<CreateLogParams, "changes"> & { changes: unknown };

/**
 * Substitui `services/task-service/src/integrations/audit.ts` no bundle. O payload
 * é o mesmo; o envio sai pelo binding AUDIT_SERVICE. Diferença deliberada: o
 * recorder do Node reenfileira falhas best-effort em background, o que o Worker
 * perderia ao responder; aqui a falha best-effort é só registrada, como nos outros
 * Workers. Auditoria `required` continua falhando a operação.
 */
async function send(params: AuditParams): Promise<void> {
  const env = getTaskServiceEnv();
  const { env: bindings } = currentTaskContext();
  if (!env.auditEnabled) {
    if (params.required) throw new Error("Audit persistence unavailable");
    return;
  }

  const now = new Date().toISOString();
  const payload = {
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
    changes: params.changes,
  };

  try {
    if (!bindings.AUDIT_SERVICE) throw new Error("binding AUDIT_SERVICE ausente");
    const response = await bindings.AUDIT_SERVICE.fetch(
      new Request(`${env.auditServiceUrl}/internal/audit/requests`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-internal-service-token": env.auditServiceToken,
        },
        body: JSON.stringify(payload),
      }),
    );
    if (!response.ok) throw new Error(`AUDIT_SERVICE respondeu ${response.status}`);
  } catch (error) {
    if (params.required) throw new Error("Audit persistence unavailable", { cause: error });
    console.warn("[task-service] auditoria best-effort falhou.", error);
  }
}

export function createLog(params: CreateLogParams): Promise<void> {
  return send(params);
}

export function logUpdateIfChanged(params: LogUpdateParams): Promise<void> {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  if (params.oldData) {
    for (const key of Object.keys(params.updatedData)) {
      const from = params.oldData[key];
      const to = params.updatedData[key];
      if (to !== from) changes[key] = { from, to };
    }
  }
  const { oldData: _old, updatedData: _updated, ...rest } = params;
  return send({ ...rest, changes });
}
