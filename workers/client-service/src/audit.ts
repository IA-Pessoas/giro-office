import type { ClientAuditEvent, ClientAuditSink } from "./clientService.js";
import type { ClientWorkerEnv } from "./env.js";

const AUDIT_PATH = "/internal/audit/requests";

/** Mesmo contrato ENTITY_CHANGE do department-service; envio best-effort. */
export function createClientAudit(env: ClientWorkerEnv): ClientAuditSink | undefined {
  const binding = env.AUDIT_SERVICE;
  const token = env.AUDIT_SERVICE_TOKEN;
  if (!binding || !token) return undefined;
  return async (event: ClientAuditEvent) => {
    const now = new Date().toISOString();
    try {
      await binding.fetch(
        new Request(new URL(AUDIT_PATH, "https://audit-service"), {
          method: "POST",
          headers: { "content-type": "application/json", "x-internal-service-token": token },
          body: JSON.stringify({
            requestId: crypto.randomUUID(),
            organizationId: event.organizationId,
            userId: event.userId,
            permission: event.permission,
            method: "ENTITY_CHANGE",
            path: `/${event.referring.replace(/\./g, "/")}`,
            outcome: "success",
            serviceSource: "client-service",
            createdAt: now,
            finishedAt: now,
            action: event.action,
            referring: event.referring,
            referringId: event.referringId,
            changes: event.changes,
          }),
        }),
      );
    } catch {
      // Auditoria de entidade não derruba a gravação; a do gateway já registrou a requisição.
    }
  };
}
