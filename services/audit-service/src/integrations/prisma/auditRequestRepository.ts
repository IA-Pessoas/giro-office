import {
  type AuditQuery,
  type AuditRequestRecord,
  type AuditSearchFilters,
  type AuditSearchResult,
  type CreateAuditRequestPayload,
  MAX_AUDIT_OFFSET,
  type OrganizationAuditPlan,
  type OrganizationAuditStatus,
  type PlatformAuditRequestRecord,
  type PlatformAuditSearchResult,
  type PlatformOrganizationAuditChanges,
  type PlatformPermissionAuditChanges,
} from "@workspace/shared/audit";
import { ACTIVE_MODULE_KEYS } from "@workspace/shared/auth";

import {
  Prisma,
  type AuditRequest as PrismaAuditRequest,
  type PrismaClient,
} from "../../../generated/prisma/client.js";

import { getOwnDataProperty } from "../../security/ownDataProperty.js";
import { getPrismaClient } from "./prismaClient.js";

export interface AuditRequestRepository {
  create(payload: CreateAuditRequestPayload): Promise<void>;
  search(filters: AuditSearchFilters): Promise<AuditSearchResult>;
  searchPlatform(filters: AuditSearchFilters): Promise<PlatformAuditSearchResult>;
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

const platformAuditSelect = {
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
  metadata_json: true,
  action: true,
  referring: true,
  referring_id: true,
  changes_json: true,
} satisfies Prisma.AuditRequestSelect;

type PlatformAuditRow = Prisma.AuditRequestGetPayload<{ select: typeof platformAuditSelect }>;

const platformAuditActions = new Set([
  "organization.created",
  "organization.status.updated",
  "organization.subscription_plan.updated",
  "organization.logo_url.updated",
]);
const PLATFORM_OWNERSHIP_TRANSFER_ACTION = "platform.organization.ownership.transfer.completed";
const organizationStatuses = new Set<OrganizationAuditStatus>([
  "trial",
  "past_due",
  "active",
  "suspended",
  "cancelled",
]);
const organizationPlans = new Set<OrganizationAuditPlan>(["trial", "pro", "enterprise"]);
const activeModuleKeySet = new Set<string>(ACTIVE_MODULE_KEYS);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function getPlatformActor(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const actor = getOwnDataProperty(value, "actorPlatformUserId");
  if (typeof actor !== "string" || actor.length > 200) {
    return undefined;
  }

  return actor.trim() || undefined;
}

function isSafeLogoUrl(value: unknown): value is string | null {
  if (value === null) {
    return true;
  }
  if (typeof value !== "string" || value.length > 2048) {
    return false;
  }

  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.username === "" && url.password === "";
  } catch {
    return false;
  }
}

function getPlatformPermissionChanges(
  record: PlatformAuditRow,
): PlatformPermissionAuditChanges | undefined {
  if (
    record.service_source !== "user-service" ||
    record.referring !== "user" ||
    typeof record.organization_id !== "string" ||
    typeof record.referring_id !== "string" ||
    record.action !== "platform.user.permissions.updated" ||
    !isRecord(record.changes_json)
  ) {
    return undefined;
  }
  const modules = getOwnDataProperty(record.changes_json, "modules");
  const before = getOwnDataProperty(modules, "before");
  const after = getOwnDataProperty(modules, "after");
  if (!isRecord(modules) || !isRecord(before) || !isRecord(after)) return undefined;
  const sanitize = (value: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(value).filter(
        ([key, level]) =>
          activeModuleKeySet.has(key) &&
          typeof level === "number" &&
          Number.isInteger(level) &&
          level >= 0 &&
          level <= 3,
      ),
    );
  const safeBefore = sanitize(before);
  const safeAfter = sanitize(after);
  return Object.keys(safeBefore).length && Object.keys(safeAfter).length
    ? { modules: { before: safeBefore, after: safeAfter } }
    : undefined;
}

function getSafeIdentifier(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 200) {
    return undefined;
  }

  return value.trim() || undefined;
}

function getPlatformOwnershipChanges(
  record: PlatformAuditRow,
): PlatformOrganizationAuditChanges | undefined {
  if (
    record.service_source !== "gateway" ||
    record.referring !== "organization" ||
    typeof record.organization_id !== "string" ||
    record.referring_id !== record.organization_id ||
    record.action !== PLATFORM_OWNERSHIP_TRANSFER_ACTION ||
    !isRecord(record.changes_json)
  ) {
    return undefined;
  }

  const ownership = getOwnDataProperty(record.changes_json, "ownership");
  if (!isRecord(ownership)) {
    return undefined;
  }

  const before = getOwnDataProperty(ownership, "before");
  const after = getOwnDataProperty(ownership, "after");
  const action = getOwnDataProperty(ownership, "previousOwnerAction");
  const justification = getOwnDataProperty(ownership, "justification");
  if (
    !isRecord(before) ||
    !isRecord(after) ||
    (action !== "demote" && action !== "deactivate") ||
    typeof justification !== "string" ||
    justification.trim().length === 0 ||
    justification.length > 500
  ) {
    return undefined;
  }

  const beforeOwnerId = getSafeIdentifier(getOwnDataProperty(before, "ownerId"));
  const afterOwnerId = getSafeIdentifier(getOwnDataProperty(after, "ownerId"));
  const previousOwner = getOwnDataProperty(after, "previousOwner");
  if (
    !beforeOwnerId ||
    !afterOwnerId ||
    beforeOwnerId === afterOwnerId ||
    before.type !== "owner" ||
    before.status !== "active" ||
    after.type !== "owner" ||
    after.status !== "active" ||
    !isRecord(previousOwner)
  ) {
    return undefined;
  }

  const previousOwnerId = getSafeIdentifier(getOwnDataProperty(previousOwner, "id"));
  const expectedStatus = action === "deactivate" ? "inactive" : "active";
  if (
    previousOwnerId !== beforeOwnerId ||
    previousOwner.type !== "admin" ||
    previousOwner.status !== expectedStatus
  ) {
    return undefined;
  }

  return {
    ownership: {
      before: { ownerId: beforeOwnerId, type: "owner", status: "active" },
      after: {
        ownerId: afterOwnerId,
        type: "owner",
        status: "active",
        previousOwner: { id: previousOwnerId, type: "admin", status: expectedStatus },
      },
      previousOwnerAction: action,
      justification: justification.trim(),
    },
  };
}

function getPlatformChanges(
  record: PlatformAuditRow,
): PlatformOrganizationAuditChanges | PlatformPermissionAuditChanges | undefined {
  const permissionChanges = getPlatformPermissionChanges(record);
  if (permissionChanges) return permissionChanges;

  const ownershipChanges = getPlatformOwnershipChanges(record);
  if (ownershipChanges) {
    return ownershipChanges;
  }
  if (
    record.service_source !== "organization-service" ||
    record.referring !== "organization" ||
    typeof record.organization_id !== "string" ||
    record.referring_id !== record.organization_id ||
    typeof record.action !== "string" ||
    !platformAuditActions.has(record.action) ||
    !isRecord(record.changes_json)
  ) {
    return undefined;
  }

  const changes: PlatformOrganizationAuditChanges = {};
  const status = getOwnDataProperty(record.changes_json, "status");
  const statusFrom = getOwnDataProperty(status, "from");
  const statusTo = getOwnDataProperty(status, "to");
  if (
    isRecord(status) &&
    (statusFrom === null || organizationStatuses.has(statusFrom as OrganizationAuditStatus)) &&
    (statusTo === null || organizationStatuses.has(statusTo as OrganizationAuditStatus))
  ) {
    changes.status = {
      from: statusFrom as OrganizationAuditStatus | null,
      to: statusTo as OrganizationAuditStatus | null,
    };
  }

  const plan = getOwnDataProperty(record.changes_json, "subscription_plan");
  const planFrom = getOwnDataProperty(plan, "from");
  const planTo = getOwnDataProperty(plan, "to");
  if (
    isRecord(plan) &&
    (planFrom === null || organizationPlans.has(planFrom as OrganizationAuditPlan)) &&
    (planTo === null || organizationPlans.has(planTo as OrganizationAuditPlan))
  ) {
    changes.subscription_plan = {
      from: planFrom as OrganizationAuditPlan | null,
      to: planTo as OrganizationAuditPlan | null,
    };
  }

  const logo = getOwnDataProperty(record.changes_json, "logo_url");
  const logoFrom = getOwnDataProperty(logo, "from");
  const logoTo = getOwnDataProperty(logo, "to");
  if (isRecord(logo) && isSafeLogoUrl(logoFrom) && isSafeLogoUrl(logoTo)) {
    changes.logo_url = { from: logoFrom, to: logoTo };
  }

  return Object.keys(changes).length > 0 ? changes : undefined;
}

function toPlatformAuditRequest(record: PlatformAuditRow): PlatformAuditRequestRecord {
  const actorPlatformUserId = getPlatformActor(record.metadata_json);
  const changes = getPlatformChanges(record);

  return {
    id: record.id,
    requestId: record.request_id,
    organizationId: record.organization_id,
    method: record.method,
    path: record.path,
    statusCode: record.status_code,
    outcome: record.outcome as AuditRequestRecord["outcome"],
    durationMs: record.duration_ms,
    serviceSource: record.service_source,
    createdAt: record.created_at.toISOString(),
    ...(record.action ? { action: record.action } : {}),
    ...(record.referring ? { referring: record.referring } : {}),
    ...(record.referring_id ? { referringId: record.referring_id } : {}),
    ...(actorPlatformUserId ? { actorPlatformUserId } : {}),
    ...(changes ? { changes } : {}),
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
    async searchPlatform(filters) {
      const where = buildWhere(filters);
      const totalLimit = MAX_AUDIT_OFFSET + filters.pageSize;
      const [items, total] = await client.$transaction([
        client.auditRequest.findMany({
          where,
          select: platformAuditSelect,
          orderBy: [{ created_at: "desc" }, { id: "desc" }],
          skip: (filters.page - 1) * filters.pageSize,
          take: filters.pageSize,
        }),
        client.auditRequest.count({ where, take: totalLimit }),
      ]);

      return {
        items: items.map(toPlatformAuditRequest),
        total: Math.min(total, totalLimit),
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
