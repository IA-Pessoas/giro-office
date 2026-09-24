import { ServiceError } from "@workspace/shared/http";
import type { ParcelamentoWorkerEnv } from "./env.js";

export type ParcelamentoAuditAction = "Cadastro" | "Atualizacao" | "Exclusao" | "Geracao";
export type ParcelamentoAuditReferring =
  | "parcelamento.installments"
  | "parcelamento.installmentsCompetencies"
  | "parcelamento.panorama";

export type RecordParcelamentoChangeInput = {
  organizationId: string;
  userId: string | null;
  permission: string | null;
  requestId: string;
  action: ParcelamentoAuditAction;
  referring: ParcelamentoAuditReferring;
  referringId: string;
  changes: Record<string, unknown>;
};

export type ParcelamentoAudit = {
  recordChange(input: RecordParcelamentoChangeInput): Promise<void>;
};

const AUDIT_TIMEOUT_MS = 2_000;

function parsePermission(permission: string | null): number | null {
  if (!permission) return null;
  const parsed = Number(permission);
  return Number.isInteger(parsed) ? parsed : null;
}

/**
 * Mesmo contrato do ParcelamentoAuditService do Node (payload, timeout de 2s,
 * AUDIT_ENABLED). Falhas lançam ServiceError; os services registram o erro sem
 * reverter a mutação já persistida, como no Node.
 */
export function createParcelamentoAudit(env: ParcelamentoWorkerEnv): ParcelamentoAudit {
  const enabled = env.AUDIT_ENABLED === undefined || ["true", "1"].includes(env.AUDIT_ENABLED);

  return {
    async recordChange(input) {
      if (!enabled) return;
      if (!env.AUDIT_SERVICE || !env.AUDIT_SERVICE_TOKEN) {
        throw new ServiceError(503, "Auditoria externa não configurada.");
      }

      const timestamp = new Date().toISOString();
      const response = await env.AUDIT_SERVICE.fetch(
        new Request("https://audit-service/internal/audit/requests", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-internal-service-token": env.AUDIT_SERVICE_TOKEN,
            "x-request-id": input.requestId,
          },
          body: JSON.stringify({
            requestId: crypto.randomUUID(),
            organizationId: input.organizationId,
            userId: input.userId,
            permission: parsePermission(input.permission),
            method: "ENTITY_CHANGE",
            path: `/${input.referring.replace(/\./gu, "/")}`,
            query: {},
            statusCode: 200,
            outcome: "success",
            durationMs: 0,
            serviceSource: "parcelamento-service",
            createdAt: timestamp,
            finishedAt: timestamp,
            metadata: { routeTarget: "parcelamento-service", requestId: input.requestId },
            action: input.action,
            referring: input.referring,
            referringId: input.referringId,
            changes: input.changes,
            department: "parcelamento",
          }),
          signal: AbortSignal.timeout(AUDIT_TIMEOUT_MS),
        }),
      );
      if (!response.ok) {
        throw new ServiceError(502, `audit-service respondeu ${response.status}`);
      }
    },
  };
}
