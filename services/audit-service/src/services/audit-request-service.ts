import {
  type AuditRequestRecord,
  type AuditSearchFilters,
  type AuditSearchResult,
  type CreateAuditRequestPayload,
  DEFAULT_AUDIT_PAGE_SIZE,
  MAX_AUDIT_PAGE_SIZE,
  ServiceError,
} from "@workspace/shared";
import { z } from "zod";

import type { AuditRequestRepository } from "../integrations/prisma/audit-request-repository.js";

export interface AuditRequestService {
  create(body: unknown): Promise<string>;
  search(query: Record<string, unknown>, organizationId: string): Promise<AuditSearchResult>;
  findByRequestId(requestId: string, organizationId: string): Promise<AuditRequestRecord | null>;
}

const createAuditRequestPayloadSchema = z.object({
  requestId: z.string().min(1),
  organizationId: z.string().min(1).optional().nullable(),
  userId: z.string().min(1).optional().nullable(),
  permission: z.number().int().optional().nullable(),
  method: z.string().min(1),
  path: z.string().min(1),
  query: z.record(z.string(), z.union([z.string(), z.array(z.string())])).optional(),
  statusCode: z.number().int().optional().nullable(),
  outcome: z.enum(["success", "error", "aborted"]),
  durationMs: z.number().int().optional().nullable(),
  ip: z.string().optional().nullable(),
  userAgent: z.string().optional().nullable(),
  origin: z.string().optional().nullable(),
  errorCode: z.string().optional().nullable(),
  errorMessage: z.string().optional().nullable(),
  serviceSource: z.string().min(1),
  createdAt: z.string().datetime(),
  finishedAt: z.string().datetime().optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
});

function getSingleQueryValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0];
  }

  return undefined;
}

function parsePositiveInteger(
  value: unknown,
  fieldName: string,
  fallback: number,
  max?: number,
): number {
  const rawValue = getSingleQueryValue(value);

  if (!rawValue) {
    return fallback;
  }

  const parsed = Number.parseInt(rawValue, 10);

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new ServiceError(400, `Parâmetro '${fieldName}' inválido.`);
  }

  if (typeof max === "number" && parsed > max) {
    return max;
  }

  return parsed;
}

function parseOptionalInteger(value: unknown, fieldName: string): number | undefined {
  const rawValue = getSingleQueryValue(value);

  if (!rawValue) {
    return undefined;
  }

  const parsed = Number.parseInt(rawValue, 10);

  if (!Number.isInteger(parsed)) {
    throw new ServiceError(400, `Parâmetro '${fieldName}' inválido.`);
  }

  return parsed;
}

function parseOptionalDate(value: unknown, fieldName: string): string | undefined {
  const rawValue = getSingleQueryValue(value);

  if (!rawValue) {
    return undefined;
  }

  const parsed = new Date(rawValue);

  if (Number.isNaN(parsed.getTime())) {
    throw new ServiceError(400, `Parâmetro '${fieldName}' inválido.`);
  }

  return parsed.toISOString();
}

function parseCreateAuditRequestPayload(body: unknown): CreateAuditRequestPayload {
  try {
    return createAuditRequestPayloadSchema.parse(body);
  } catch (error) {
    throw new ServiceError(400, "Payload de auditoria inválido.", error);
  }
}

function buildAuditSearchFilters(
  query: Record<string, unknown>,
  organizationId: string,
): AuditSearchFilters {
  const dateFrom = parseOptionalDate(query.dateFrom, "dateFrom");
  const dateTo = parseOptionalDate(query.dateTo, "dateTo");

  if (dateFrom && dateTo && new Date(dateFrom) > new Date(dateTo)) {
    throw new ServiceError(400, "Parâmetros de data inválidos.");
  }

  return {
    organizationId,
    requestId: getSingleQueryValue(query.requestId),
    userId: getSingleQueryValue(query.userId),
    method: getSingleQueryValue(query.method)?.toUpperCase(),
    path: getSingleQueryValue(query.path),
    statusCode: parseOptionalInteger(query.statusCode, "statusCode"),
    dateFrom,
    dateTo,
    page: parsePositiveInteger(query.page, "page", 1),
    pageSize: parsePositiveInteger(
      query.pageSize,
      "pageSize",
      DEFAULT_AUDIT_PAGE_SIZE,
      MAX_AUDIT_PAGE_SIZE,
    ),
  };
}

export function createAuditRequestService(repository: AuditRequestRepository): AuditRequestService {
  return {
    async create(body) {
      const payload = parseCreateAuditRequestPayload(body);
      await repository.create(payload);
      return payload.requestId;
    },
    async search(query, organizationId) {
      const filters = buildAuditSearchFilters(query, organizationId);
      return repository.search(filters);
    },
    async findByRequestId(requestId, organizationId) {
      return repository.findByRequestId(requestId, organizationId);
    },
  };
}
