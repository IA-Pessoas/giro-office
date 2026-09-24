import { INTERNAL_SERVICE_TOKEN_HEADER, ServiceError } from "@workspace/shared/http";
import type {
  TriageAuditEvent,
  TriageAuditEventDispatcher,
} from "@workspace/triagem-service/src/services/triageAuditService.js";
import type { TriagemWorkerEnv } from "./env.js";

function eventPayload(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

// Mesmo payload do dispatcher Node (services/triagem-service/src/integrations/triageAuditDispatcher.ts),
// entregue pelo binding AUDIT_SERVICE. Falha lança erro: o evento continua pendente na outbox
// (attempts incrementado) e a próxima reconciliação tenta de novo.
export function createTriageAuditDispatcher(env: TriagemWorkerEnv): TriageAuditEventDispatcher {
  const binding = env.AUDIT_SERVICE;
  const token = env.AUDIT_SERVICE_TOKEN;
  if (!binding || !token) {
    throw new ServiceError(503, "Auditoria externa não configurada.");
  }

  return async (event: TriageAuditEvent) => {
    const payload = eventPayload(event.payload);
    const occurredAt = event.occurred_at.toISOString();
    const response = await binding.fetch(
      new Request("https://audit-service/internal/audit/requests", {
        method: "POST",
        headers: { "content-type": "application/json", [INTERNAL_SERVICE_TOKEN_HEADER]: token },
        body: JSON.stringify({
          requestId: event.event_key,
          organizationId: event.organization_id,
          userId: typeof payload.actor_user_id === "string" ? payload.actor_user_id : null,
          method: "ENTITY_CHANGE",
          path: "/triagem/competencies",
          outcome: "success",
          serviceSource: "triagem-service",
          createdAt: occurredAt,
          finishedAt: occurredAt,
          action: event.event_type,
          referring: "triagem.competences",
          referringId: event.aggregate_id,
          changes: payload,
          metadata: { event_id: event.id, aggregate_type: event.aggregate_type },
        }),
        signal: AbortSignal.timeout(5_000),
      }),
    );
    if (!response.ok) {
      throw new ServiceError(502, `Audit-service respondeu ${response.status}.`);
    }
  };
}
