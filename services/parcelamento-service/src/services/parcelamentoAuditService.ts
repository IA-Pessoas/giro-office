import { randomUUID } from "node:crypto";

import type { Logger } from "@workspace/shared/logger";

export type ParcelamentoAuditAction = "Cadastro" | "Atualizacao" | "Exclusao" | "Geracao";

export type ParcelamentoAuditReferring =
  | "parcelamento.installments"
  | "parcelamento.installmentsCompetencies"
  | "parcelamento.panorama";

export type ParcelamentoAuditServiceDependencies = {
  enabled: boolean;
  serviceUrl: string;
  serviceToken: string;
  logger: Pick<Logger, "warn" | "error" | "debug">;
  clock?: () => Date;
  requestIdFactory?: () => string;
  timeoutMs?: number;
};

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

export function withoutOrganizationId(input: object): Record<string, unknown> {
  const output = Object.fromEntries(
    Object.entries(input).filter(([key]) => key !== "organization_id"),
  );

  return output;
}

export function createAuditDiff(
  previous: object,
  next: Record<string, unknown>,
): Record<string, { from: unknown; to: unknown }> {
  const diff: Record<string, { from: unknown; to: unknown }> = {};
  const previousRecord = previous as Record<string, unknown>;

  for (const [key, value] of Object.entries(next)) {
    if (previousRecord[key] !== value) {
      diff[key] = { from: previousRecord[key], to: value };
    }
  }

  return diff;
}

function buildAuditUrl(serviceUrl: string): string {
  return `${serviceUrl.replace(/\/$/, "")}/internal/audit/requests`;
}

function buildPath(referring: ParcelamentoAuditReferring): string {
  return `/${referring.replace(/\./g, "/")}`;
}

function parsePermission(permission: string | null): number | null {
  if (!permission) return null;
  const parsed = Number(permission);

  return Number.isInteger(parsed) ? parsed : null;
}

export class ParcelamentoAuditService {
  private readonly enabled: boolean;
  private readonly serviceToken: string;
  private readonly logger: Pick<Logger, "warn" | "error" | "debug">;
  private readonly clock: () => Date;
  private readonly requestIdFactory: () => string;
  private readonly url: string;
  private readonly timeoutMs: number;

  constructor({
    enabled,
    serviceUrl,
    serviceToken,
    logger,
    clock,
    requestIdFactory,
    timeoutMs,
  }: ParcelamentoAuditServiceDependencies) {
    this.enabled = enabled;
    this.serviceToken = serviceToken;
    this.logger = logger;
    this.clock = clock ?? (() => new Date());
    this.requestIdFactory = requestIdFactory ?? randomUUID;
    this.url = buildAuditUrl(serviceUrl);
    this.timeoutMs = timeoutMs ?? 2_000;
  }

  async recordChange(input: RecordParcelamentoChangeInput): Promise<void> {
    if (!this.enabled) {
      return;
    }

    const timestamp = this.clock().toISOString();
    const auditRequestId = this.requestIdFactory();
    const payload = {
      requestId: auditRequestId,
      organizationId: input.organizationId,
      userId: input.userId,
      permission: parsePermission(input.permission),
      method: "ENTITY_CHANGE",
      path: buildPath(input.referring),
      query: {},
      statusCode: 200,
      outcome: "success",
      durationMs: 0,
      serviceSource: "parcelamento-service",
      createdAt: timestamp,
      finishedAt: timestamp,
      metadata: {
        routeTarget: "parcelamento-service",
        requestId: input.requestId,
      },
      action: input.action,
      referring: input.referring,
      referringId: input.referringId,
      changes: input.changes,
      department: "parcelamento",
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(this.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-internal-service-token": this.serviceToken,
          "x-request-id": input.requestId,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        this.logger.warn(
          {
            err: new Error(`audit-service respondeu ${response.status}`),
            referring: input.referring,
            referringId: input.referringId,
          },
          "Falha ao registrar auditoria de parcelamento.",
        );
      }
    } catch (err: unknown) {
      this.logger.warn(
        {
          err,
          referring: input.referring,
          referringId: input.referringId,
        },
        "Falha ao registrar auditoria de parcelamento.",
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
