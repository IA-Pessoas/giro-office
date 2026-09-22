import type {
  AuditQuery,
  AuditQueryValue,
  AuditRequestRecord,
  AuditSearchFilters,
  AuditSearchResult,
  CreateAuditRequestPayload,
  PlatformAuditSearchResult,
} from "@workspace/shared/audit";
import {
  DEFAULT_AUDIT_PAGE_SIZE,
  MAX_AUDIT_OFFSET,
  MAX_AUDIT_PAGE,
  MAX_AUDIT_PAGE_SIZE,
  MAX_AUDIT_TEXT_FILTER_LENGTH,
} from "@workspace/shared/audit";
import {
  getSingleQueryValue,
  parseOptionalDate,
  parseOptionalInteger,
  parsePositiveInteger,
  ServiceError,
} from "@workspace/shared/http";
import { z } from "zod";

import type { AuditRequestRepository } from "./repository.js";

export interface AuditRequestService {
  create(body: unknown): Promise<string>;
  search(query: Record<string, unknown>, organizationId: string): Promise<AuditSearchResult>;
  searchPlatform(query: Record<string, unknown>): Promise<PlatformAuditSearchResult>;
  findByRequestId(requestId: string, organizationId: string): Promise<AuditRequestRecord | null>;
}

const payloadSchema = z.object({
  requestId: z.string().min(1),
  organizationId: z.string().min(1).optional().nullable(),
  userId: z.string().min(1).optional().nullable(),
  permission: z.number().int().optional().nullable(),
  method: z.string().min(1).default("ENTITY_CHANGE"),
  path: z.string().min(1).default("/"),
  query: z
    .custom<AuditQuery>(isAuditQuery, "Query de auditoria inválida.")
    .transform(cloneAuditQuery)
    .optional(),
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

function isAuditQueryValue(value: unknown): value is AuditQueryValue {
  return (
    typeof value === "string" ||
    (Array.isArray(value) && value.every((item) => typeof item === "string"))
  );
}

function isAuditQuery(value: unknown): value is AuditQuery {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).every((key) =>
      isAuditQueryValue(Object.getOwnPropertyDescriptor(value, key)?.value),
    )
  );
}

function cloneAuditQuery(value: AuditQuery): AuditQuery {
  const query = Object.create(null) as AuditQuery;
  for (const key of Object.keys(value)) {
    Object.defineProperty(query, key, {
      configurable: true,
      enumerable: true,
      value: Object.getOwnPropertyDescriptor(value, key)?.value,
      writable: true,
    });
  }
  return query;
}

function ownValue(query: Record<string, unknown>, key: string): unknown {
  return Object.hasOwn(query, key) ? query[key] : undefined;
}

function textFilter(query: Record<string, unknown>, fieldName: string): string | undefined {
  const value = getSingleQueryValue(query[fieldName]);
  if (value && value.length > MAX_AUDIT_TEXT_FILTER_LENGTH) {
    throw new ServiceError(400, `Parâmetro '${fieldName}' inválido.`);
  }
  return value;
}

function filters(query: Record<string, unknown>, organizationId?: string): AuditSearchFilters {
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
    requestId: textFilter(query, "requestId"),
    userId: textFilter(query, "userId"),
    method: textFilter(query, "method")?.toUpperCase(),
    path: textFilter(query, "path"),
    statusCode: parseOptionalInteger(query.statusCode, "statusCode"),
    dateFrom,
    dateTo,
    referring: textFilter(query, "referring"),
    referringId: textFilter(query, "referringId"),
    department: textFilter(query, "department"),
    page,
    pageSize,
  };
}

function platformOrganizationId(query: Record<string, unknown>): string | undefined {
  const value = ownValue(query, "organizationId");
  if (value === undefined) return undefined;
  const parsed = z.string().uuid().safeParse(value);
  if (!parsed.success) throw new ServiceError(400, "Parâmetro 'organizationId' inválido.");
  return parsed.data;
}

export function createAuditRequestService(repository: AuditRequestRepository): AuditRequestService {
  return {
    async create(body) {
      let payload: CreateAuditRequestPayload;
      try {
        payload = payloadSchema.parse(body);
      } catch (error) {
        throw new ServiceError(400, "Payload de auditoria inválido.", error);
      }
      await repository.create(payload);
      return payload.requestId;
    },
    search(query, organizationId) {
      return repository.search(filters(query, organizationId));
    },
    searchPlatform(query) {
      return repository.searchPlatform(filters(query, platformOrganizationId(query)));
    },
    findByRequestId(requestId, organizationId) {
      return repository.findByRequestId(requestId, organizationId);
    },
  };
}
