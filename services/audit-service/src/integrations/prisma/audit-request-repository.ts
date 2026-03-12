import type {
  AuditQuery,
  AuditRequestRecord,
  AuditSearchFilters,
  AuditSearchResult,
  CreateAuditRequestPayload,
} from "@workspace/shared/audit";

import {
  Prisma,
  type AuditRequest as PrismaAuditRequest,
  type PrismaClient,
} from "../../../generated/prisma/client.js";

import { getPrismaClient } from "./prisma-client.js";

export interface AuditRequestRepository {
  create(payload: CreateAuditRequestPayload): Promise<void>;
  search(filters: AuditSearchFilters): Promise<AuditSearchResult>;
  findByRequestId(requestId: string, organizationId: string): Promise<AuditRequestRecord | null>;
}

function toJsonValue(
  value: Record<string, unknown> | AuditQuery | undefined | null,
): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return Prisma.JsonNull;
  }

  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function normalizeQuery(value: unknown): AuditQuery {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const query: AuditQuery = {};

  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry === "string") {
      query[key] = entry;
      continue;
    }

    if (Array.isArray(entry) && entry.every((item) => typeof item === "string")) {
      query[key] = entry;
    }
  }

  return query;
}

function normalizeMetadata(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function toAuditRequest(record: PrismaAuditRequest): AuditRequestRecord {
  return {
    id: record.id,
    requestId: record.request_id,
    organizationId: record.organization_id,
    userId: record.user_id,
    permission: record.permission,
    method: record.method,
    path: record.path,
    query: normalizeQuery(record.query_json),
    statusCode: record.status_code,
    outcome: record.outcome as AuditRequestRecord["outcome"],
    durationMs: record.duration_ms,
    ip: record.ip,
    userAgent: record.user_agent,
    origin: record.origin,
    errorCode: record.error_code,
    errorMessage: record.error_message,
    serviceSource: record.service_source,
    createdAt: record.created_at.toISOString(),
    finishedAt: record.finished_at?.toISOString() ?? null,
    metadata: normalizeMetadata(record.metadata_json),
  };
}

function buildWhere(filters: AuditSearchFilters): Prisma.AuditRequestWhereInput {
  const where: Prisma.AuditRequestWhereInput = {
    organization_id: filters.organizationId,
  };

  if (filters.requestId) {
    where.request_id = filters.requestId;
  }

  if (filters.userId) {
    where.user_id = filters.userId;
  }

  if (filters.method) {
    where.method = filters.method.toUpperCase();
  }

  if (filters.path) {
    where.path = {
      contains: filters.path,
      mode: "insensitive",
    };
  }

  if (typeof filters.statusCode === "number") {
    where.status_code = filters.statusCode;
  }

  if (filters.dateFrom || filters.dateTo) {
    where.created_at = {};

    if (filters.dateFrom) {
      where.created_at.gte = new Date(filters.dateFrom);
    }

    if (filters.dateTo) {
      where.created_at.lte = new Date(filters.dateTo);
    }
  }

  return where;
}

export function createAuditRequestRepository(
  client: PrismaClient = getPrismaClient(),
): AuditRequestRepository {
  return {
    async create(payload) {
      await client.auditRequest.create({
        data: {
          request_id: payload.requestId,
          organization_id: payload.organizationId ?? null,
          user_id: payload.userId ?? null,
          permission: payload.permission ?? null,
          method: payload.method.toUpperCase(),
          path: payload.path,
          query_json: toJsonValue(payload.query),
          status_code: payload.statusCode ?? null,
          outcome: payload.outcome,
          duration_ms: payload.durationMs ?? null,
          ip: payload.ip ?? null,
          user_agent: payload.userAgent ?? null,
          origin: payload.origin ?? null,
          error_code: payload.errorCode ?? null,
          error_message: payload.errorMessage ?? null,
          service_source: payload.serviceSource,
          metadata_json: toJsonValue(payload.metadata),
          created_at: new Date(payload.createdAt),
          finished_at: payload.finishedAt ? new Date(payload.finishedAt) : null,
        },
      });
    },
    async search(filters) {
      const where = buildWhere(filters);
      const [items, total] = await client.$transaction([
        client.auditRequest.findMany({
          where,
          orderBy: {
            created_at: "desc",
          },
          skip: (filters.page - 1) * filters.pageSize,
          take: filters.pageSize,
        }),
        client.auditRequest.count({ where }),
      ]);

      return {
        items: items.map(toAuditRequest),
        total,
        page: filters.page,
        pageSize: filters.pageSize,
      };
    },
    async findByRequestId(requestId, organizationId) {
      const item = await client.auditRequest.findFirst({
        where: {
          request_id: requestId,
          organization_id: organizationId,
        },
      });

      return item ? toAuditRequest(item) : null;
    },
  };
}
