import {
  type AuditRequestRecord,
  type AuditSearchFilters,
  type AuditSearchResult,
  type CreateAuditRequestPayload,
  DEFAULT_AUDIT_PAGE_SIZE,
  MAX_AUDIT_PAGE_SIZE,
} from "@workspace/shared/audit";
import {
  getSingleQueryValue,
  parseOptionalDate,
  parseOptionalInteger,
  parsePositiveInteger,
  ServiceError,
} from "@workspace/shared/http";
import { z } from "zod";

import type { AuditRequestRepository } from "../integrations/prisma/auditRequestRepository.js";

export interface AuditRequestService {
  create(body: unknown): Promise<string>;
  search(query: Record<string, unknown>, organizationId?: string): Promise<AuditSearchResult>;
  findByRequestId(requestId: string, organizationId: string): Promise<AuditRequestRecord | null>;
}

const MAX_AUDIT_PAGE = 10_001;
const MAX_AUDIT_OFFSET = 10_000;
const MAX_AUDIT_TEXT_FILTER_LENGTH = 200;

function getBoundedTextFilter(
  query: Record<string, unknown>,
  fieldName: string,
): string | undefined {
  const value = getSingleQueryValue(query[fieldName]);
  if (value && value.length > MAX_AUDIT_TEXT_FILTER_LENGTH) {
    throw new ServiceError(400, `Parâmetro '${fieldName}' inválido.`);
  }
  return value;
}

const createAuditRequestPayloadSchema = z.object({
  requestId: z.string().min(1),
  organizationId: z.string().min(1).optional().nullable(),
  userId: z.string().min(1).optional().nullable(),
  permission: z.number().int().optional().nullable(),
  method: z.string().min(1).default("ENTITY_CHANGE"),
  path: z.string().min(1).default("/"),
  query: z.record(z.string(), z.union([z.string(), z.array(z.string())])).optional(),
  statusCode: z.number().int().optional().nullable(),
  outcome: z.enum(["success", "error", "aborted"]).default("success"),
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
  action: z.string().optional().nullable(),
  referring: z.string().optional().nullable(),
  referringId: z.string().optional().nullable(),
  changes: z
    .union([z.record(z.string(), z.unknown()), z.string()])
    .optional()
    .nullable(),
  department: z.string().optional().nullable(),
});

function parseCreateAuditRequestPayload(body: unknown): CreateAuditRequestPayload {
  try {
    return createAuditRequestPayloadSchema.parse(body);
  } catch (error) {
    throw new ServiceError(400, "Payload de auditoria inválido.", error);
  }
}

function buildAuditSearchFilters(
  query: Record<string, unknown>,
  organizationId?: string,
): AuditSearchFilters {
  const dateFrom = parseOptionalDate(query.dateFrom, "dateFrom");
  const dateTo = parseOptionalDate(query.dateTo, "dateTo");

  if (dateFrom && dateTo && new Date(dateFrom) > new Date(dateTo)) {
    throw new ServiceError(400, "Parâmetros de data inválidos.");
  }

  const page = parsePositiveInteger(query.page, "page", 1, MAX_AUDIT_PAGE);
  const pageSize = parsePositiveInteger(
    query.pageSize,
    "pageSize",
    DEFAULT_AUDIT_PAGE_SIZE,
    MAX_AUDIT_PAGE_SIZE,
  );

  if ((page - 1) * pageSize > MAX_AUDIT_OFFSET) {
    throw new ServiceError(400, "Janela de paginação inválida.");
  }

  return {
    ...(organizationId ? { organizationId } : {}),
    requestId: getBoundedTextFilter(query, "requestId"),
    userId: getBoundedTextFilter(query, "userId"),
    method: getBoundedTextFilter(query, "method")?.toUpperCase(),
    path: getBoundedTextFilter(query, "path"),
    statusCode: parseOptionalInteger(query.statusCode, "statusCode"),
    dateFrom,
    dateTo,
    referring: getBoundedTextFilter(query, "referring"),
    referringId: getBoundedTextFilter(query, "referringId"),
    department: getBoundedTextFilter(query, "department"),
    page,
    pageSize,
  };
}

export function createAuditRequestService(repository: AuditRequestRepository): AuditRequestService {
  return {
    async create(body: unknown): Promise<string> {
      const payload = parseCreateAuditRequestPayload(body);
      await repository.create(payload);
      return payload.requestId;
    },
    async search(
      query: Record<string, unknown>,
      organizationId?: string,
    ): Promise<AuditSearchResult> {
      const filters = buildAuditSearchFilters(query, organizationId);
      return repository.search(filters);
    },
    async findByRequestId(
      requestId: string,
      organizationId: string,
    ): Promise<AuditRequestRecord | null> {
      return repository.findByRequestId(requestId, organizationId);
    },
  };
}
