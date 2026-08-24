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

import { getPrismaClient } from "./prismaClient.js";

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

function normalizeChanges(
  value: Record<string, unknown> | string | undefined | null,
): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return Prisma.JsonNull;
  }

  if (typeof value === "string") {
    try {
      return JSON.parse(value) as Prisma.InputJsonValue;
    } catch {
      return { raw: value } as Prisma.InputJsonValue;
    }
  }

  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function toAuditRequest(record: PrismaAuditRequest): AuditRequestRecord {
  const rec = record as PrismaAuditRequest & {
    action?: string | null;
    referring?: string | null;
    referring_id?: string | null;
    changes_json?: unknown;
    department?: string | null;
  };
  const changes = rec.changes_json;
  const changesNormalized =
    changes !== null && typeof changes === "object" && !Array.isArray(changes)
      ? (changes as Record<string, unknown>)
      : null;

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
    action: rec.action ?? null,
    referring: rec.referring ?? null,
    referringId: rec.referring_id ?? null,
    changes: changesNormalized,
    department: rec.department ?? null,
  };
}

function buildWhere(filters: AuditSearchFilters): Prisma.AuditRequestWhereInput {
  const where: Prisma.AuditRequestWhereInput = {};

  if (filters.organizationId) {
    where.organization_id = filters.organizationId;
  }

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
    const createdAt: Prisma.DateTimeFilter<"AuditRequest"> = {};
    if (filters.dateFrom) {
      createdAt.gte = new Date(filters.dateFrom);
    }
    if (filters.dateTo) {
      createdAt.lte = new Date(filters.dateTo);
    }
    where.created_at = createdAt;
  }

  if (filters.referring) {
    (where as Record<string, unknown>).referring = filters.referring;
  }

  if (filters.referringId) {
    (where as Record<string, unknown>).referring_id = filters.referringId;
  }

  if (filters.department) {
    (where as Record<string, unknown>).department = filters.department;
  }

  return where;
}

export function createAuditRequestRepository(
  client: PrismaClient = getPrismaClient(),
): AuditRequestRepository {
  return {
    async create(payload) {
      const createData = {
        request_id: payload.requestId,
        ...(payload.organizationId && {
          organization: { connect: { id: payload.organizationId } },
        }),
        ...(payload.userId && {
          user: { connect: { id: payload.userId } },
        }),
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
        action: payload.action ?? null,
        referring: payload.referring ?? null,
        referring_id: payload.referringId ?? null,
        changes_json: normalizeChanges(payload.changes),
        department: payload.department ?? null,
      };
      await client.auditRequest.create({
        data: createData as Parameters<typeof client.auditRequest.create>[0]["data"],
      });
    },
    async search(filters) {
      const where = buildWhere(filters);
      const [items, total] = await client.$transaction([
        client.auditRequest.findMany({
          where,
          orderBy: [{ created_at: "desc" }, { id: "desc" }],
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
