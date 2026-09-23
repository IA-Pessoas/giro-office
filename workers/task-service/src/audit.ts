import type { TaskAudit } from "@workspace/task-service/src/integrations/audit.js";
import type { TaskWorkerEnv } from "./env.js";

type AuditParams = Parameters<TaskAudit["createLog"]>[0];

/**
 * Mesmo payload do `integrations/audit.ts` do Node, enviado pelo binding AUDIT_SERVICE.
 * Diferença deliberada: o recorder Node reenfileira falhas best-effort em background,
 * o que o Worker perderia ao responder; aqui a falha é só registrada, como nos outros
 * Workers. Auditoria `required` continua falhando a operação.
 */
export function createTaskAudit(env: TaskWorkerEnv): TaskAudit {
  async function send(params: Omit<AuditParams, "changes"> & { changes: unknown }) {
    if (env.AUDIT_ENABLED === "false") {
      if (params.required) throw new Error("Audit persistence unavailable");
      return;
    }
    const now = new Date().toISOString();
    try {
      if (!env.AUDIT_SERVICE || !env.AUDIT_SERVICE_TOKEN) {
        throw new Error("binding AUDIT_SERVICE ou AUDIT_SERVICE_TOKEN ausente");
      }
      const response = await env.AUDIT_SERVICE.fetch(
        new Request("https://audit-service/internal/audit/requests", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-internal-service-token": env.AUDIT_SERVICE_TOKEN,
          },
          body: JSON.stringify({
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
          }),
        }),
      );
      if (!response.ok) throw new Error(`AUDIT_SERVICE respondeu ${response.status}`);
    } catch (error) {
      if (params.required) throw new Error("Audit persistence unavailable", { cause: error });
      console.warn("[task-service] auditoria best-effort falhou.", error);
    }
  }

  return {
    createLog: (params) => send(params),
    logUpdateIfChanged: ({ oldData, updatedData, ...params }) => {
      const changes: Record<string, { from: unknown; to: unknown }> = {};
      if (oldData) {
        for (const key of Object.keys(updatedData)) {
          if (updatedData[key] !== oldData[key]) {
            changes[key] = { from: oldData[key], to: updatedData[key] };
          }
        }
      }
      return send({ ...params, changes });
    },
  };
}
