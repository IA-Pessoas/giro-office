import { ServiceError } from "@workspace/shared";
import { type CreateAuditRequestPayload, createAuditRecorder } from "@workspace/shared/audit";
import type { Logger } from "@workspace/shared/logger";

import type { MarketingServiceEnv } from "../config/env.js";

/** Uma alteração atribuída a ator, organização, objeto e instante. */
export interface MarketingAuditEntry {
  organizationId: string;
  userId: string;
  action: string;
  referring: string;
  referringId: string;
  changes: Record<string, unknown>;
}

/**
 * Grava a trilha exigida antes do commit: os serviços chamam dentro da transação, e a
 * falha lança e desfaz a alteração (sem sucesso sem trilha).
 */
export type MarketingAudit = (entry: MarketingAuditEntry) => Promise<void>;

export const AUDIT_UNAVAILABLE_MESSAGE = "Auditoria indisponível; a alteração não foi salva.";

export function marketingAuditPayload(entry: MarketingAuditEntry): CreateAuditRequestPayload {
  const now = new Date().toISOString();
  return {
    requestId: crypto.randomUUID(),
    organizationId: entry.organizationId,
    userId: entry.userId,
    method: "ENTITY_CHANGE",
    path: `/${entry.referring.replace(/\./g, "/")}`,
    outcome: "success",
    serviceSource: "marketing-service",
    createdAt: now,
    finishedAt: now,
    action: entry.action,
    referring: entry.referring,
    referringId: entry.referringId,
    changes: entry.changes,
  };
}

/** Campos que mudaram, como `{ campo: { from, to } }`; compara por valor (JSON). */
export function changedFields(
  previous: object,
  next: object,
): Record<string, { from: unknown; to: unknown }> {
  const before = previous as Record<string, unknown>;
  const after = next as Record<string, unknown>;
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(after)) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      changes[key] = { from: before[key] ?? null, to: after[key] };
    }
  }
  return changes;
}

export function createMarketingAudit(env: MarketingServiceEnv, logger: Logger): MarketingAudit {
  const recorder = createAuditRecorder({
    enabled: env.auditEnabled,
    serviceUrl: env.auditServiceUrl,
    serviceToken: env.auditServiceToken,
    logger,
  });
  return async (entry) => {
    try {
      await recorder.recordRequired(marketingAuditPayload(entry));
    } catch (error) {
      throw new ServiceError(503, AUDIT_UNAVAILABLE_MESSAGE, error);
    }
  };
}
