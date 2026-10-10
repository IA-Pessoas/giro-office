import { ServiceError } from "@workspace/shared";
import { createAuditRecorder } from "@workspace/shared/audit";
import type { Logger } from "@workspace/shared/logger";

import type { ClientServiceEnv } from "../config/env.js";

/** Alteração de cliente atribuída a ator, organização, objeto e instante. */
export interface ClientEntityAuditEntry {
  organizationId: string;
  userId: string;
  action: string;
  referring: string;
  referringId: string;
  changes: Record<string, { from: unknown; to: unknown }>;
}

/** Trilha exigida: chamada dentro da transação; a falha lança e desfaz a alteração. */
export type ClientEntityAudit = (entry: ClientEntityAuditEntry) => Promise<void>;

export const AUDIT_UNAVAILABLE_MESSAGE = "Auditoria indisponível; a alteração não foi salva.";

export function auditUnavailable(cause?: unknown): ServiceError {
  return new ServiceError(503, AUDIT_UNAVAILABLE_MESSAGE, cause, undefined, { expose: true });
}

export function createClientEntityAudit(env: ClientServiceEnv, logger: Logger): ClientEntityAudit {
  const recorder = createAuditRecorder({
    enabled: env.auditEnabled,
    serviceUrl: env.auditServiceUrl,
    serviceToken: env.auditServiceToken,
    logger,
  });
  return async (entry) => {
    const now = new Date().toISOString();
    try {
      await recorder.recordRequired({
        requestId: crypto.randomUUID(),
        organizationId: entry.organizationId,
        userId: entry.userId,
        method: "ENTITY_CHANGE",
        path: `/${entry.referring.replace(/\./g, "/")}`,
        outcome: "success",
        serviceSource: "client-service",
        createdAt: now,
        finishedAt: now,
        action: entry.action,
        referring: entry.referring,
        referringId: entry.referringId,
        changes: entry.changes,
      });
    } catch (error) {
      throw auditUnavailable(error);
    }
  };
}
