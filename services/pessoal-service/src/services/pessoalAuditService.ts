import { randomUUID } from "node:crypto";

import type { AuditQuery, AuditRecorder, CreateAuditRequestPayload } from "@workspace/shared/audit";
import { INTERNAL_SERVICE_TOKEN_HEADER } from "@workspace/shared/http";
import type { Logger } from "@workspace/shared/logger";

const SECRET_FIELDS = new Set(["login_main", "senha_main", "login_secondary", "senha_secondary"]);
const REDACTED_VALUE = "[redacted]";
const DEFAULT_AUDIT_TIMEOUT_MS = 3_000;

export type PessoalAuditAction =
  | "Cadastro"
  | "Atualizacao"
  | "Exclusao"
  | "Geracao"
  | "Notificacao";

export interface PessoalAuditChangeInput {
  requestId?: string | null;
  organizationId: string;
  userId: string;
  permission?: number | null;
  action: PessoalAuditAction | string;
  referring: string;
  referringId: string;
  changes?: Record<string, unknown> | string | null;
  path?: string;
  query?: AuditQuery;
  statusCode?: number | null;
  metadata?: Record<string, unknown> | null;
}

export interface PessoalAuditServiceOptions {
  enabled: boolean;
  serviceUrl: string;
  serviceToken: string;
  logger: Logger;
  timeoutMs?: number;
  requestIdFactory?: () => string;
  now?: () => Date;
  recorder?: AuditRecorder;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function redactSecretValue(value: unknown): unknown {
  if (!isRecord(value)) {
    return REDACTED_VALUE;
  }

  if ("from" in value || "to" in value) {
    return {
      from: REDACTED_VALUE,
      to: REDACTED_VALUE,
    };
  }

  return REDACTED_VALUE;
}

function redactChanges(
  changes: Record<string, unknown> | string | null | undefined,
): Record<string, unknown> {
  if (typeof changes === "string") {
    return { value: REDACTED_VALUE };
  }

  if (!isRecord(changes)) {
    return {};
  }

  const redactedChanges: Record<string, unknown> = {};

  for (const [field, value] of Object.entries(changes)) {
    redactedChanges[field] = SECRET_FIELDS.has(field) ? redactSecretValue(value) : value;
  }

  return redactedChanges;
}

function buildPathFromReferring(referring: string): string {
  return `/${referring.replace(/\./g, "/")}`;
}

function buildMetadata(
  metadata: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  return {
    ...(metadata ?? {}),
    routeTarget: "pessoal-service",
  };
}

function createPessoalAuditRecorder(options: {
  enabled: boolean;
  serviceUrl: string;
  serviceToken: string;
  logger: Logger;
  timeoutMs: number;
}): AuditRecorder {
  if (!options.enabled) {
    return async () => {};
  }

  const url = new URL("/internal/audit/requests", options.serviceUrl);

  return async (payload: CreateAuditRequestPayload) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [INTERNAL_SERVICE_TOKEN_HEADER]: options.serviceToken,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (response.ok) {
        return;
      }

      options.logger.warn({
        event: "audit.ingest.failed",
        message: "Audit ingest request failed",
        request: {
          id: payload.requestId,
        },
        http: {
          statusCode: response.status,
        },
      });
    } catch (err) {
      options.logger.error({
        event: "audit.ingest.failed",
        message: "Audit ingest request failed",
        request: {
          id: payload.requestId,
        },
        err,
      });
    } finally {
      clearTimeout(timeout);
    }
  };
}

export class PessoalAuditService {
  private readonly now: () => Date;
  private readonly recordAudit: AuditRecorder;
  private readonly requestIdFactory: () => string;
  private readonly logger: Logger;

  constructor(options: PessoalAuditServiceOptions) {
    this.logger = options.logger;
    this.now = options.now ?? (() => new Date());
    this.requestIdFactory = options.requestIdFactory ?? randomUUID;
    this.recordAudit =
      options.recorder ??
      createPessoalAuditRecorder({
        enabled: options.enabled,
        serviceUrl: options.serviceUrl,
        serviceToken: options.serviceToken,
        logger: options.logger,
        timeoutMs: options.timeoutMs ?? DEFAULT_AUDIT_TIMEOUT_MS,
      });
  }

  async recordChange(input: PessoalAuditChangeInput): Promise<void> {
    const timestamp = this.now().toISOString();
    const requestId = input.requestId?.trim() || this.requestIdFactory();
    const payload: CreateAuditRequestPayload = {
      requestId,
      organizationId: input.organizationId,
      userId: input.userId,
      permission: input.permission ?? null,
      method: "ENTITY_CHANGE",
      path: input.path ?? buildPathFromReferring(input.referring),
      query: input.query ?? {},
      statusCode: input.statusCode ?? 200,
      outcome: "success",
      durationMs: 0,
      serviceSource: "pessoal-service",
      createdAt: timestamp,
      finishedAt: timestamp,
      metadata: buildMetadata(input.metadata),
      action: input.action,
      referring: input.referring,
      referringId: input.referringId,
      changes: redactChanges(input.changes),
      department: "pessoal",
    };

    try {
      await this.recordAudit(payload);
    } catch (err) {
      this.logger.error({
        event: "pessoal.audit.record.failed",
        message: "Pessoal domain audit record failed",
        request: {
          id: requestId,
        },
        err,
      });
    }
  }
}
