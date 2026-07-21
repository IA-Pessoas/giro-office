import {
  type AuditRequestRecord,
  type AuditSearchFilters,
  type AuditSearchResult,
  type CreateAuditRequestPayload,
  DEFAULT_AUDIT_PAGE_SIZE,
  type ForwardedAuditAuthContext,
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
  search(
    query: Record<string, unknown>,
    auth: ForwardedAuditAuthContext,
  ): Promise<AuditSearchResult>;
  findByRequestId(
    requestId: string,
    auth: ForwardedAuditAuthContext,
  ): Promise<AuditRequestRecord | null>;
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
  auth: ForwardedAuditAuthContext,
): AuditSearchFilters {
  const dateFrom = parseOptionalDate(query.dateFrom, "dateFrom");
  const dateTo = parseOptionalDate(query.dateTo, "dateTo");
  const isPlatformAdmin = auth.authKind === "platform" && auth.platformRole === "super_admin";
  const requestedOrganizationId = getSingleQueryValue(query.organizationId);
  const organizationId = isPlatformAdmin ? requestedOrganizationId : auth.organizationId;

  if (dateFrom && dateTo && new Date(dateFrom) > new Date(dateTo)) {
    throw new ServiceError(400, "Parâmetros de data inválidos.");
  }

  if (!isPlatformAdmin && !organizationId) {
    throw new ServiceError(401, "Não autenticado.");
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
    referring: getSingleQueryValue(query.referring),
    referringId: getSingleQueryValue(query.referringId),
    department: getSingleQueryValue(query.department),
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
    async create(body: unknown): Promise<string> {
      const payload = parseCreateAuditRequestPayload(body);
      await repository.create(payload);
      return payload.requestId;
    },
    async search(
      query: Record<string, unknown>,
      auth: ForwardedAuditAuthContext,
    ): Promise<AuditSearchResult> {
      const filters = buildAuditSearchFilters(query, auth);
      return repository.search(filters);
    },
    async findByRequestId(
      requestId: string,
      auth: ForwardedAuditAuthContext,
    ): Promise<AuditRequestRecord | null> {
      const isPlatformAdmin = auth.authKind === "platform" && auth.platformRole === "super_admin";

      if (!isPlatformAdmin && !auth.organizationId) {
        throw new ServiceError(401, "Não autenticado.");
      }

      return repository.findByRequestId(
        requestId,
        isPlatformAdmin ? undefined : auth.organizationId,
      );
    },
  };
}
