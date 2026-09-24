import type {
  AuditQuery,
  AuditRequestRecord,
  AuditSearchFilters,
  AuditSearchResult,
  CreateAuditRequestPayload,
  PlatformAuditSearchResult,
} from "@workspace/shared/audit";

export interface AuditRequestRepository {
  create(payload: CreateAuditRequestPayload): Promise<void>;
  search(filters: AuditSearchFilters): Promise<AuditSearchResult>;
  searchPlatform(filters: AuditSearchFilters): Promise<PlatformAuditSearchResult>;
  findByRequestId(requestId: string, organizationId: string): Promise<AuditRequestRecord | null>;
}

interface AuditRow {
  id: string;
  request_id: string;
  organization_id: string | null;
  user_id: string | null;
  permission: number | null;
  method: string;
  path: string;
  query_json: unknown;
  status_code: number | null;
  outcome: string;
  duration_ms: number | null;
  ip: string | null;
  user_agent: string | null;
  origin: string | null;
  error_code: string | null;
  error_message: string | null;
  service_source: string;
  metadata_json: unknown;
  created_at: Date;
  finished_at: Date | null;
  action: string | null;
  referring: string | null;
  referring_id: string | null;
  changes_json: unknown;
  department: string | null;
  organization?: { name: string } | null;
}

interface AuditPrismaClient {
  auditRequest: {
    upsert(args: Record<string, unknown>): Promise<unknown>;
    findMany(args: Record<string, unknown>): Promise<AuditRow[]>;
    count(args: Record<string, unknown>): Promise<number>;
    findFirst(args: Record<string, unknown>): Promise<AuditRow | null>;
  };
  platformUser?: {
    findMany(args: Record<string, unknown>): Promise<Array<{ id: string; name: string }>>;
  };
  $transaction<T extends readonly Promise<unknown>[]>(operations: T): Promise<unknown[]>;
}

function jsonValue(value: unknown): unknown {
  return value === undefined
    ? undefined
    : value === null
      ? null
      : JSON.parse(JSON.stringify(value));
}

function normalizeQuery(value: unknown): AuditQuery {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      ([, entry]) =>
        typeof entry === "string" ||
        (Array.isArray(entry) && entry.every((item) => typeof item === "string")),
    ),
  ) as AuditQuery;
}

function normalizeMetadata(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function toAuditRecord(row: AuditRow): AuditRequestRecord {
  const changes =
    row.changes_json && typeof row.changes_json === "object" && !Array.isArray(row.changes_json)
      ? (row.changes_json as Record<string, unknown>)
      : null;

  return {
    id: row.id,
    requestId: row.request_id,
    organizationId: row.organization_id,
    userId: row.user_id,
    permission: row.permission,
    method: row.method,
    path: row.path,
    query: normalizeQuery(row.query_json),
    statusCode: row.status_code,
    outcome: row.outcome as AuditRequestRecord["outcome"],
    durationMs: row.duration_ms,
    ip: row.ip,
    userAgent: row.user_agent,
    origin: row.origin,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    serviceSource: row.service_source,
    createdAt: row.created_at.toISOString(),
    finishedAt: row.finished_at?.toISOString() ?? null,
    metadata: normalizeMetadata(row.metadata_json),
    action: row.action,
    referring: row.referring,
    referringId: row.referring_id,
    changes,
    department: row.department,
  };
}

function whereFor(filters: AuditSearchFilters): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  if (filters.organizationId) where.organization_id = filters.organizationId;
  if (filters.requestId) where.request_id = filters.requestId;
  if (filters.userId) where.user_id = filters.userId;
  if (filters.method) where.method = filters.method.toUpperCase();
  if (filters.path) where.path = { contains: filters.path, mode: "insensitive" };
  if (typeof filters.statusCode === "number") where.status_code = filters.statusCode;
  if (filters.dateFrom || filters.dateTo) {
    where.created_at = {
      ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
      ...(filters.dateTo ? { lte: new Date(filters.dateTo) } : {}),
    };
  }
  if (filters.referring) where.referring = filters.referring;
  if (filters.referringId) where.referring_id = filters.referringId;
  if (filters.department) where.department = filters.department;
  return where;
}

export function createAuditRequestRepository(client: AuditPrismaClient): AuditRequestRepository {
  return {
    async create(payload) {
      await client.auditRequest.upsert({
        where: { request_id: payload.requestId },
        update: {},
        create: {
          request_id: payload.requestId,
          organization_id: payload.organizationId ?? null,
          user_id: payload.userId ?? null,
          permission: payload.permission ?? null,
          method: payload.method.toUpperCase(),
          path: payload.path,
          query_json: jsonValue(payload.query),
          status_code: payload.statusCode ?? null,
          outcome: payload.outcome,
          duration_ms: payload.durationMs ?? null,
          ip: payload.ip ?? null,
          user_agent: payload.userAgent ?? null,
          origin: payload.origin ?? null,
          error_code: payload.errorCode ?? null,
          error_message: payload.errorMessage ?? null,
          service_source: payload.serviceSource,
          metadata_json: jsonValue(payload.metadata),
          created_at: new Date(payload.createdAt),
          finished_at: payload.finishedAt ? new Date(payload.finishedAt) : null,
          action: payload.action ?? null,
          referring: payload.referring ?? null,
          referring_id: payload.referringId ?? null,
          changes_json: jsonValue(
            typeof payload.changes === "string"
              ? (() => {
                  try {
                    return JSON.parse(payload.changes);
                  } catch {
                    return { raw: payload.changes };
                  }
                })()
              : payload.changes,
          ),
          department: payload.department ?? null,
        },
      });
    },

    async search(filters) {
      const where = whereFor(filters);
      const [items, total] = (await client.$transaction([
        client.auditRequest.findMany({
          where,
          orderBy: [{ created_at: "desc" }, { id: "desc" }],
          skip: (filters.page - 1) * filters.pageSize,
          take: filters.pageSize,
        }),
        client.auditRequest.count({ where }),
      ])) as [AuditRow[], number];

      return {
        items: items.map(toAuditRecord),
        total,
        page: filters.page,
        pageSize: filters.pageSize,
      };
    },

    async searchPlatform(filters) {
      const where = whereFor(filters);
      const [items, total] = (await client.$transaction([
        client.auditRequest.findMany({
          where,
          select: {
            id: true,
            request_id: true,
            organization_id: true,
            method: true,
            path: true,
            status_code: true,
            outcome: true,
            duration_ms: true,
            service_source: true,
            created_at: true,
            action: true,
            referring: true,
            referring_id: true,
            organization: { select: { name: true } },
          },
          orderBy: [{ created_at: "desc" }, { id: "desc" }],
          skip: (filters.page - 1) * filters.pageSize,
          take: filters.pageSize,
        }),
        client.auditRequest.count({ where, take: 10_000 + filters.pageSize }),
      ])) as [AuditRow[], number];

      return {
        items: items.map((row) => ({
          id: row.id,
          requestId: row.request_id,
          organizationId: row.organization_id,
          method: row.method,
          path: row.path,
          statusCode: row.status_code,
          outcome: row.outcome as AuditRequestRecord["outcome"],
          durationMs: row.duration_ms,
          serviceSource: row.service_source,
          createdAt: row.created_at.toISOString(),
          ...(row.action ? { action: row.action } : {}),
          ...(row.referring ? { referring: row.referring } : {}),
          ...(row.referring_id ? { referringId: row.referring_id } : {}),
          ...(row.organization?.name ? { organizationName: row.organization.name } : {}),
        })),
        total: Math.min(total, 10_000 + filters.pageSize),
        page: filters.page,
        pageSize: filters.pageSize,
      };
    },

    async findByRequestId(requestId, organizationId) {
      const row = await client.auditRequest.findFirst({
        where: { request_id: requestId, organization_id: organizationId },
      });
      return row ? toAuditRecord(row) : null;
    },
  };
}
