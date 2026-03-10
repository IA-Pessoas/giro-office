import { INTERNAL_SERVICE_TOKEN_HEADER } from "./headers.js";
import type { Logger } from "./logger.js";

export const DEFAULT_AUDIT_PAGE_SIZE = 50;
export const MAX_AUDIT_PAGE_SIZE = 200;
export const AUDIT_ADMIN_PERMISSION = 2;

export type AuditOutcome = "success" | "error" | "aborted";
export type AuditQueryValue = string | string[];
export type AuditQuery = Record<string, AuditQueryValue>;
export type AuditRecorder = (payload: CreateAuditRequestPayload) => Promise<void>;

export interface CreateAuditRequestPayload {
  requestId: string;
  organizationId?: string | null;
  userId?: string | null;
  permission?: number | null;
  method: string;
  path: string;
  query?: AuditQuery;
  statusCode?: number | null;
  outcome: AuditOutcome;
  durationMs?: number | null;
  ip?: string | null;
  userAgent?: string | null;
  origin?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  serviceSource: string;
  createdAt: string;
  finishedAt?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface AuditRequestRecord {
  id: string;
  requestId: string;
  organizationId?: string | null;
  userId?: string | null;
  permission?: number | null;
  method: string;
  path: string;
  query: AuditQuery;
  statusCode?: number | null;
  outcome: AuditOutcome;
  durationMs?: number | null;
  ip?: string | null;
  userAgent?: string | null;
  origin?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  serviceSource: string;
  createdAt: string;
  finishedAt?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface AuditSearchFilters {
  organizationId: string;
  requestId?: string;
  userId?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  dateFrom?: string;
  dateTo?: string;
  page: number;
  pageSize: number;
}

export interface AuditSearchResult {
  items: AuditRequestRecord[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ForwardedAuditAuthContext {
  userId: string;
  organizationId: string;
  permission?: number;
}

interface CreateAuditRecorderOptions {
  enabled: boolean;
  serviceUrl: string;
  serviceToken: string;
  logger: Logger;
}

export function createAuditRecorder({
  enabled,
  serviceUrl,
  serviceToken,
  logger,
}: CreateAuditRecorderOptions): AuditRecorder {
  if (!enabled) {
    return async () => {};
  }

  const url = new URL("/internal/audit/requests", serviceUrl);

  return async (payload) => {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [INTERNAL_SERVICE_TOKEN_HEADER]: serviceToken,
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        return;
      }

      logger.warn({
        event: "audit.ingest.failed",
        message: "Audit ingest request failed",
        request: {
          id: payload.requestId,
        },
        http: {
          statusCode: response.status,
        },
      });
    } catch (error) {
      logger.error({
        event: "audit.ingest.failed",
        message: "Audit ingest request failed",
        request: {
          id: payload.requestId,
        },
        err: error,
      });
    }
  };
}
