import { type CreateAuditRequestPayload, createAuditRecorder } from "@workspace/shared/audit";
import type { Logger } from "@workspace/shared/logger";

import type { TriagemServiceEnv } from "../config/env.js";
import type {
  TriageAuditEvent,
  TriageAuditEventDispatcher,
} from "../services/triageAuditService.js";

function eventPayload(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function createTriageAuditDispatcher(
  env: Pick<TriagemServiceEnv, "auditEnabled" | "auditServiceUrl" | "auditServiceToken">,
  logger: Logger,
): TriageAuditEventDispatcher {
  const recorder = createAuditRecorder({
    enabled: env.auditEnabled,
    serviceUrl: env.auditServiceUrl,
    serviceToken: env.auditServiceToken,
    logger,
  });

  return async (event: TriageAuditEvent) => {
    const payload = eventPayload(event.payload);
    const occurredAt = event.occurred_at.toISOString();
    const auditPayload: CreateAuditRequestPayload = {
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
      metadata: {
        event_id: event.id,
        aggregate_type: event.aggregate_type,
      },
    };

    await recorder.recordRequired(auditPayload);
  };
}
