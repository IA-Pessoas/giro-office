import type {
  ApplyGroupAssignmentPreviewBody,
  CreateGroupAssignmentPreviewBody,
  GroupAssignmentEligibleQuery,
  GroupAssignmentPreviewQuery,
} from "@workspace/pessoal-service/src/schemas/groupAssignment.schemas.js";
import type { ServiceBinding } from "@workspace/runtime";
import { error as logError, ServiceError } from "@workspace/shared";
import { INTERNAL_SERVICE_TOKEN_HEADER } from "@workspace/shared/http";

import type { PessoalWorkerEnv } from "./env.js";

type Row = Record<string, unknown>;
type Model = {
  findMany(args: Record<string, unknown>): Promise<Row[]>;
  findFirst(args: Record<string, unknown>): Promise<Row | null>;
};
type PreviewRecord = Row & {
  id: string;
  fingerprint: string;
  version: number;
  totals: unknown;
  expires_at: Date;
  applied_at: Date | null;
  target_group_id: string;
  targetGroup: { id: string; name: string; archived_at: Date | null };
};

type AssignmentTransaction = {
  $executeRaw: (query: TemplateStringsArray, ...values: unknown[]) => Promise<number>;
  pessoalGroupAssignmentConfirmation: {
    findUnique(args: Record<string, unknown>): Promise<Row | null>;
    create(args: Record<string, unknown>): Promise<Row>;
  };
  pessoalGroupAssignmentPreview: {
    findFirst(args: Record<string, unknown>): Promise<PreviewRecord | null>;
    update(args: Record<string, unknown>): Promise<Row>;
  };
  pessoalGroupAssignmentPreviewDetail: Model;
  client: Model;
  payroll: Model & { updateMany(args: Record<string, unknown>): Promise<{ count: number }> };
  pessoalAuditOutboxEvent: {
    create(args: Record<string, unknown>): Promise<Row>;
    updateMany(args: Record<string, unknown>): Promise<{ count: number }>;
  };
};

export type PessoalAssignmentPrisma = {
  $queryRaw: (query: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>;
  $transaction<T>(callback: (transaction: AssignmentTransaction) => Promise<T>): Promise<T>;
  pessoalGroup: Model;
  client: Model;
  payroll: Model;
  pessoalGroupAssignmentPreview: {
    create(args: Record<string, unknown>): Promise<Row>;
    findFirst(args: Record<string, unknown>): Promise<PreviewRecord | null>;
  };
  pessoalGroupAssignmentPreviewDetail: Model & {
    count(args: Record<string, unknown>): Promise<number>;
  };
  pessoalAuditOutboxEvent: {
    findMany(args: Record<string, unknown>): Promise<Row[]>;
    count(args: Record<string, unknown>): Promise<number>;
    update(args: Record<string, unknown>): Promise<Row>;
    updateMany(args: Record<string, unknown>): Promise<{ count: number }>;
  };
};

export type PessoalNotificationPrisma = {
  unionPessoal: Model;
  permission: Model;
  pessoalNotification: {
    findMany(args: Record<string, unknown>): Promise<Row[]>;
    createMany(args: Record<string, unknown>): Promise<{ count: number }>;
  };
};

export type PessoalAuditChangeInput = {
  requestId?: string | null;
  organizationId: string;
  userId: string;
  permission?: number | null;
  action: string;
  referring: string;
  referringId: string;
  changes?: Record<string, unknown> | null;
  path?: string;
  metadata?: Record<string, unknown> | null;
};

export type PessoalAuditRecorder = (input: PessoalAuditChangeInput) => Promise<boolean>;

const PREVIEW_TTL_MS = 15 * 60 * 1000;
const ACTIVE_CLIENT_STATUS = "Ativo";
const OUTCOME_CHANGED = "CHANGED";
const OUTCOME_NO_OP = "NO_OP";
const OUTCOME_SKIPPED = "SKIPPED";
const PENDING_AUDIT_OUTBOX_STATUS = "pending";
const PROCESSING_AUDIT_OUTBOX_STATUS = "processing";
const PROCESSED_AUDIT_OUTBOX_STATUS = "processed";
const AUDIT_OUTBOX_RECONCILIATION_LIMIT = 100;
const AUDIT_SERVICE_TIMEOUT_MS = 5_000;
const UNION_REGARDING = "union";
const NOTIFICATION_CREATE_CHUNK_SIZE = 100;

type PreviewTotals = { changed: number; no_op: number; skipped: number; requested: number };

function isPreviewTotals(value: unknown): value is PreviewTotals {
  if (!value || typeof value !== "object") return false;
  const totals = value as Record<string, unknown>;
  return ["changed", "no_op", "skipped", "requested"].every(
    (key) => typeof totals[key] === "number",
  );
}

function isAuditChangeInput(value: unknown): value is PessoalAuditChangeInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  return ["organizationId", "userId", "action", "referring", "referringId"].every(
    (field) => typeof input[field] === "string" && String(input[field]).trim().length > 0,
  );
}

async function hash(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function toPage<T>(data: T[], total: number, page: number, limit: number) {
  return { data, total, page, limit, hasMore: page * limit < total };
}

function requirePermission(context: { permission?: number }, minimum: number): void {
  if (typeof context.permission !== "number" || context.permission < minimum) {
    throw new ServiceError(403, "Permissao insuficiente para acessar o pessoal-service.");
  }
}

function requireUserId(context: { userId?: string }): string {
  const userId = context.userId?.trim();
  if (!userId) throw new ServiceError(401, "Autenticacao obrigatoria.");
  return userId;
}

function toAuditPayload(input: PessoalAuditChangeInput, now: Date): Record<string, unknown> {
  const requestId = input.requestId?.trim();
  if (!requestId) throw new ServiceError(422, "RequestId de auditoria ausente.");
  const timestamp = now.toISOString();
  return {
    requestId,
    organizationId: input.organizationId,
    userId: input.userId,
    permission: input.permission ?? null,
    method: "ENTITY_CHANGE",
    path: input.path ?? `/${input.referring.replace(/\./g, "/")}`,
    query: {},
    statusCode: 200,
    outcome: "success",
    durationMs: 0,
    serviceSource: "pessoal-service",
    createdAt: timestamp,
    finishedAt: timestamp,
    metadata: { ...(input.metadata ?? {}), routeTarget: "pessoal-service" },
    action: input.action,
    referring: input.referring,
    referringId: input.referringId,
    changes: input.changes ?? {},
    department: "pessoal",
  };
}

function auditErrorContext(error: unknown): Record<string, unknown> {
  if (error instanceof ServiceError) {
    return {
      name: error.name,
      code: error.code,
      statusCode: error.statusCode,
      message: error.message,
    };
  }
  if (error instanceof Error) return { name: error.name, message: error.message };
  return { message: String(error) };
}

function pendingAuditPayload(
  payload: PessoalAuditChangeInput,
  error: unknown,
  failedAt: Date,
): PessoalAuditChangeInput {
  return {
    ...payload,
    metadata: {
      ...(payload.metadata ?? {}),
      auditDelivery: {
        status: PENDING_AUDIT_OUTBOX_STATUS,
        failedAt: failedAt.toISOString(),
        error: auditErrorContext(error),
      },
    },
  };
}

export async function sendPessoalAudit(
  env: PessoalWorkerEnv | undefined,
  input: Record<string, unknown>,
): Promise<boolean> {
  if (!env?.AUDIT_SERVICE) return false;
  // O audit-service valida o mesmo segredo que os chamadores guardam em AUDIT_SERVICE_TOKEN;
  // INTERNAL_SERVICE_TOKEN é o do gateway e o audit-service responde 401 a ele.
  if (!env.AUDIT_SERVICE_TOKEN) {
    throw new ServiceError(503, "Auditoria externa não configurada.");
  }
  const binding: ServiceBinding = env.AUDIT_SERVICE;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AUDIT_SERVICE_TIMEOUT_MS);

  try {
    const response = await binding.fetch(
      new Request("https://audit.internal/internal/audit/requests", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [INTERNAL_SERVICE_TOKEN_HEADER]: env.AUDIT_SERVICE_TOKEN,
        },
        body: JSON.stringify(input),
      }),
      { signal: controller.signal },
    );
    if (!response.ok) {
      throw new ServiceError(502, `AUDIT_SERVICE respondeu com HTTP ${response.status}.`);
    }
    return true;
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    if (controller.signal.aborted) {
      throw new ServiceError(504, "Tempo esgotado ao chamar AUDIT_SERVICE.", error);
    }
    throw new ServiceError(502, "Falha ao chamar AUDIT_SERVICE.", error);
  } finally {
    clearTimeout(timeout);
  }
}

export function createPessoalAuditRecorder(env?: PessoalWorkerEnv): PessoalAuditRecorder {
  return (input) => sendPessoalAudit(env, toAuditPayload(input, new Date()));
}

export class GroupAssignmentService {
  constructor(
    private readonly prisma: PessoalAssignmentPrisma,
    private readonly audit: PessoalAuditRecorder,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async listEligible(
    context: { organizationId: string; permission?: number },
    query: GroupAssignmentEligibleQuery,
  ): Promise<ReturnType<typeof toPage<Row>>> {
    requirePermission(context, 1);
    const offset = (query.page - 1) * query.limit;
    const search = query.search ?? null;
    const rows = (await this.prisma.$queryRaw`
      SELECT payroll."client_id" AS "client_id", client."name" AS "client_name",
        payroll."id" AS "payroll_id", payroll."group_id" AS "group_id",
        pessoal_group."name" AS "group_name", COUNT(*) OVER()::int AS "total"
      FROM "pessoal.payroll" AS payroll
      INNER JOIN "clients" AS client
        ON client."id" = payroll."client_id"
        AND client."organization_id" = payroll."organization_id"
      LEFT JOIN "pessoal.group" AS pessoal_group ON pessoal_group."id" = payroll."group_id"
      WHERE payroll."organization_id" = ${context.organizationId}
        AND client."status" = ${ACTIVE_CLIENT_STATUS}
        AND client."pessoal" = TRUE
        AND (${search}::text IS NULL OR client."name" ILIKE '%' || ${search} || '%')
      ORDER BY client."name" ASC, client."id" ASC
      LIMIT ${query.limit} OFFSET ${offset}
    `) as Array<Row & { total?: number | bigint }>;
    return toPage(
      rows.map(({ total: _total, ...row }) => row),
      rows[0]?.total === undefined ? 0 : Number(rows[0].total),
      query.page,
      query.limit,
    );
  }

  async createPreview(
    context: { organizationId: string; userId?: string; permission?: number },
    body: CreateGroupAssignmentPreviewBody,
  ): Promise<unknown> {
    requirePermission(context, 2);
    const userId = requireUserId(context);
    const targetGroup = await this.prisma.pessoalGroup.findFirst({
      where: { id: body.group_id, organization_id: context.organizationId, archived_at: null },
      select: { id: true, name: true, archived_at: true },
    });
    if (!targetGroup) throw new ServiceError(409, "Grupo de destino inexistente ou arquivado.");

    const [clients, payrolls] = await Promise.all([
      this.prisma.client.findMany({
        where: { organization_id: context.organizationId, id: { in: body.client_ids } },
        select: { id: true, name: true, status: true, pessoal: true },
      }),
      this.prisma.payroll.findMany({
        where: { organization_id: context.organizationId, client_id: { in: body.client_ids } },
        select: { id: true, client_id: true, group_id: true },
      }),
    ]);
    const groupIds = payrolls
      .map((payroll) => payroll.group_id)
      .filter((groupId): groupId is string => typeof groupId === "string");
    const groups = await this.prisma.pessoalGroup.findMany({
      where: { organization_id: context.organizationId, id: { in: groupIds } },
      select: { id: true, name: true },
    });
    const clientsById = new Map(clients.map((client) => [String(client.id), client]));
    const payrollsByClientId = new Map(
      payrolls.map((payroll) => [String(payroll.client_id), payroll]),
    );
    const groupsById = new Map(groups.map((group) => [String(group.id), group]));
    const details = body.client_ids.map((clientId) => {
      const client = clientsById.get(clientId);
      const payroll = payrollsByClientId.get(clientId);
      if (!client)
        return { client_id: clientId, outcome: OUTCOME_SKIPPED, skip_reason: "CLIENT_NOT_FOUND" };
      if (client.status !== ACTIVE_CLIENT_STATUS) {
        return {
          client_id: clientId,
          client_name: String(client.name),
          outcome: OUTCOME_SKIPPED,
          skip_reason: "CLIENT_NOT_ACTIVE",
        };
      }
      if (client.pessoal !== true) {
        return {
          client_id: clientId,
          client_name: String(client.name),
          outcome: OUTCOME_SKIPPED,
          skip_reason: "CLIENT_NOT_PESSOAL",
        };
      }
      if (!payroll) {
        return {
          client_id: clientId,
          client_name: String(client.name),
          outcome: OUTCOME_SKIPPED,
          skip_reason: "PAYROLL_NOT_FOUND",
        };
      }
      return {
        client_id: clientId,
        client_name: String(client.name),
        payroll_id: String(payroll.id),
        previous_group_id: typeof payroll.group_id === "string" ? payroll.group_id : null,
        previous_group_name: groupsById.get(String(payroll.group_id))?.name ?? null,
        outcome: payroll.group_id === targetGroup.id ? OUTCOME_NO_OP : OUTCOME_CHANGED,
      };
    });
    const totals: PreviewTotals = {
      changed: details.filter((detail) => detail.outcome === OUTCOME_CHANGED).length,
      no_op: details.filter((detail) => detail.outcome === OUTCOME_NO_OP).length,
      skipped: details.filter((detail) => detail.outcome === OUTCOME_SKIPPED).length,
      requested: details.length,
    };
    const previewId = crypto.randomUUID();
    const expiresAt = new Date(this.now().getTime() + PREVIEW_TTL_MS);
    const fingerprint = await hash({
      group_id: targetGroup.id,
      details: [...details].sort((left, right) => left.client_id.localeCompare(right.client_id)),
    });
    await this.prisma.pessoalGroupAssignmentPreview.create({
      data: {
        id: previewId,
        organization_id: context.organizationId,
        target_group_id: targetGroup.id,
        fingerprint,
        totals,
        expires_at: expiresAt,
        created_by_id: userId,
        details: { create: details },
      },
    });
    return this.detailPreview(context, previewId, { page: 1, limit: 25 });
  }

  async detailPreview(
    context: { organizationId: string; permission?: number },
    previewId: string,
    query: GroupAssignmentPreviewQuery,
  ): Promise<unknown> {
    requirePermission(context, 1);
    const preview = await this.prisma.pessoalGroupAssignmentPreview.findFirst({
      where: { id: previewId, organization_id: context.organizationId },
      select: {
        id: true,
        fingerprint: true,
        version: true,
        totals: true,
        expires_at: true,
        applied_at: true,
        target_group_id: true,
        targetGroup: { select: { id: true, name: true, archived_at: true } },
      },
    });
    if (!preview) throw new ServiceError(404, "Previa de atribuicao em lote nao encontrada.");
    const [total, details] = await Promise.all([
      this.prisma.pessoalGroupAssignmentPreviewDetail.count({ where: { preview_id: preview.id } }),
      this.prisma.pessoalGroupAssignmentPreviewDetail.findMany({
        where: { preview_id: preview.id },
        orderBy: { id: "asc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: {
          client_id: true,
          client_name: true,
          payroll_id: true,
          previous_group_id: true,
          previous_group_name: true,
          outcome: true,
          skip_reason: true,
        },
      }),
    ]);
    if (!isPreviewTotals(preview.totals))
      throw new ServiceError(500, "Previa de atribuicao invalida.");
    return {
      preview_id: preview.id,
      fingerprint: preview.fingerprint,
      version: preview.version,
      expires_at: preview.expires_at,
      ttl_seconds: Math.max(
        0,
        Math.floor((preview.expires_at.getTime() - this.now().getTime()) / 1000),
      ),
      applied_at: preview.applied_at,
      target_group: { id: preview.targetGroup.id, name: preview.targetGroup.name },
      totals: preview.totals,
      details: toPage(
        details.map((detail) => ({
          client_id: detail.client_id,
          client_name: detail.client_name ?? null,
          payroll_id: detail.payroll_id ?? null,
          previous_group_id: detail.previous_group_id ?? null,
          previous_group_name: detail.previous_group_name ?? null,
          outcome: detail.outcome,
          skip_reason: detail.skip_reason ?? null,
        })),
        total,
        query.page,
        query.limit,
      ),
    };
  }

  async apply(
    context: { organizationId: string; userId?: string; permission?: number; requestId?: string },
    body: ApplyGroupAssignmentPreviewBody,
    idempotencyKey: string,
  ): Promise<Record<string, unknown>> {
    requirePermission(context, 2);
    const userId = requireUserId(context);
    const commandHash = await hash({ preview_id: body.preview_id, fingerprint: body.fingerprint });
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify([context.organizationId, body.preview_id])}, 0))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify([context.organizationId, idempotencyKey])}, 0))`;
      const previous = await tx.pessoalGroupAssignmentConfirmation.findUnique({
        where: {
          organization_id_idempotency_key: {
            organization_id: context.organizationId,
            idempotency_key: idempotencyKey,
          },
        },
      });
      if (previous) {
        if (previous.command_hash !== commandHash) {
          throw new ServiceError(409, "Idempotency-Key ja utilizada com outro comando.");
        }
        return {
          response: previous.response_snapshot as Record<string, unknown>,
          idempotent: true,
        };
      }
      const requestId = context.requestId?.trim() || crypto.randomUUID();
      const preview = await tx.pessoalGroupAssignmentPreview.findFirst({
        where: { id: body.preview_id, organization_id: context.organizationId },
        select: {
          id: true,
          fingerprint: true,
          version: true,
          totals: true,
          expires_at: true,
          applied_at: true,
          target_group_id: true,
          targetGroup: { select: { id: true, name: true, archived_at: true } },
        },
      });
      if (!preview || preview.fingerprint !== body.fingerprint) {
        throw new ServiceError(409, "Previa inexistente ou obsoleta. Gere uma nova previa.");
      }
      if (
        preview.applied_at ||
        preview.expires_at <= this.now() ||
        preview.targetGroup.archived_at
      ) {
        throw new ServiceError(409, "Previa expirada ou obsoleta. Gere uma nova previa.");
      }
      if (!isPreviewTotals(preview.totals))
        throw new ServiceError(409, "Previa invalida. Gere uma nova previa.");
      const actionable = await tx.pessoalGroupAssignmentPreviewDetail.findMany({
        where: { preview_id: preview.id, outcome: { in: [OUTCOME_CHANGED, OUTCOME_NO_OP] } },
        select: { client_id: true, payroll_id: true, previous_group_id: true, outcome: true },
      });
      const actionableClientIds = actionable.map((detail) => detail.client_id);
      const [clients, payrolls] = await Promise.all([
        tx.client.findMany({
          where: { id: { in: actionableClientIds }, organization_id: context.organizationId },
          select: { id: true, status: true, pessoal: true },
        }),
        tx.payroll.findMany({
          where: {
            client_id: { in: actionableClientIds },
            organization_id: context.organizationId,
          },
          select: { id: true, client_id: true, group_id: true },
        }),
      ]);
      const clientsById = new Map(clients.map((client) => [String(client.id), client]));
      const payrollsByClientId = new Map(
        payrolls.map((payroll) => [String(payroll.client_id), payroll]),
      );
      for (const detail of actionable) {
        const client = clientsById.get(String(detail.client_id));
        const payroll = payrollsByClientId.get(String(detail.client_id));
        if (
          detail.previous_group_id === null ||
          !client ||
          client.status !== ACTIVE_CLIENT_STATUS ||
          client.pessoal !== true ||
          !payroll ||
          payroll.id !== detail.payroll_id ||
          payroll.group_id !== detail.previous_group_id
        ) {
          throw new ServiceError(409, "Previa obsoleta. Gere uma nova previa.");
        }
      }
      for (const detail of actionable) {
        if (detail.outcome !== OUTCOME_CHANGED || detail.previous_group_id === null) continue;
        const changed = await tx.payroll.updateMany({
          where: {
            id: detail.payroll_id ?? "",
            client_id: detail.client_id,
            organization_id: context.organizationId,
            group_id: detail.previous_group_id,
          },
          data: { group_id: preview.target_group_id },
        });
        if (changed.count !== 1)
          throw new ServiceError(409, "Previa obsoleta. Gere uma nova previa.");
      }
      const response = {
        preview_id: preview.id,
        changed: preview.totals.changed,
        no_op: preview.totals.no_op,
        skipped: preview.totals.skipped,
      };
      const auditPayload: PessoalAuditChangeInput = {
        requestId,
        organizationId: context.organizationId,
        userId,
        permission: context.permission,
        action: "Atualizacao",
        referring: "pessoal.group-assignment",
        referringId: preview.id,
        path: "/pessoal/group-assignments/apply",
        changes: {
          target_group_id: preview.target_group_id,
          changed_client_ids: actionable
            .filter((detail) => detail.outcome === OUTCOME_CHANGED)
            .map((detail) => detail.client_id),
          totals: response,
        },
      };
      const outbox = await tx.pessoalAuditOutboxEvent.create({
        data: {
          organization_id: context.organizationId,
          preview_id: preview.id,
          payload: auditPayload,
        },
        select: { id: true },
      });
      await tx.pessoalGroupAssignmentPreview.update({
        where: { id: preview.id },
        data: { applied_at: this.now() },
      });
      await tx.pessoalGroupAssignmentConfirmation.create({
        data: {
          organization_id: context.organizationId,
          preview_id: preview.id,
          idempotency_key: idempotencyKey,
          command_hash: commandHash,
          response_snapshot: response,
        },
      });
      return { response, idempotent: false, auditPayload, outboxId: outbox.id };
    });
    if (result.idempotent) return { ...result.response, idempotent: true };
    if (!result.auditPayload || !result.outboxId) {
      throw new ServiceError(500, "Resultado de auditoria da atribuicao em lote invalido.");
    }
    try {
      const auditRecorded = await this.audit(result.auditPayload);
      if (auditRecorded) {
        await this.prisma.pessoalAuditOutboxEvent.update({
          where: { id: result.outboxId },
          data: { status: PROCESSED_AUDIT_OUTBOX_STATUS, processed_at: this.now() },
        });
      }
    } catch (error) {
      logError("Falha ao registrar auditoria pós-commit de atribuição em lote", {
        error,
        outboxId: result.outboxId,
      });
      try {
        await this.prisma.pessoalAuditOutboxEvent.update({
          where: { id: result.outboxId },
          data: {
            status: PENDING_AUDIT_OUTBOX_STATUS,
            processed_at: null,
            payload: pendingAuditPayload(result.auditPayload, error, this.now()),
          },
        });
      } catch (outboxError) {
        logError("Falha ao registrar contexto da falha de auditoria na outbox", {
          error: outboxError,
          outboxId: result.outboxId,
        });
      }
    }
    return { ...result.response, idempotent: false };
  }

  async reconcilePendingAuditEvents(): Promise<{ processed: number; pending: number }> {
    const events = await this.prisma.pessoalAuditOutboxEvent.findMany({
      where: { status: PENDING_AUDIT_OUTBOX_STATUS },
      orderBy: { created_at: "asc" },
      take: AUDIT_OUTBOX_RECONCILIATION_LIMIT,
      select: { id: true, payload: true },
    });
    let processed = 0;
    for (const event of events) {
      const wasProcessed = await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.$executeRaw`
          UPDATE "pessoal.audit_outbox_events"
          SET "status" = ${PROCESSING_AUDIT_OUTBOX_STATUS}
          WHERE "id" = ${event.id} AND "status" = ${PENDING_AUDIT_OUTBOX_STATUS}
        `;
        if (claimed !== 1) return false;

        const payload = event.payload;
        if (!isAuditChangeInput(payload)) {
          await tx.pessoalAuditOutboxEvent.updateMany({
            where: { id: event.id, status: PROCESSING_AUDIT_OUTBOX_STATUS },
            data: { status: PENDING_AUDIT_OUTBOX_STATUS },
          });
          return false;
        }

        const auditPayload = {
          ...payload,
          requestId: payload.requestId?.trim() || String(event.id),
        };
        if (!(await this.audit(auditPayload))) {
          await tx.pessoalAuditOutboxEvent.updateMany({
            where: { id: event.id, status: PROCESSING_AUDIT_OUTBOX_STATUS },
            data: { status: PENDING_AUDIT_OUTBOX_STATUS },
          });
          return false;
        }

        const updated = await tx.pessoalAuditOutboxEvent.updateMany({
          where: { id: event.id, status: PROCESSING_AUDIT_OUTBOX_STATUS },
          data: { status: PROCESSED_AUDIT_OUTBOX_STATUS, processed_at: this.now() },
        });
        return updated.count === 1;
      });
      processed += wasProcessed ? 1 : 0;
    }
    return {
      processed,
      pending: await this.prisma.pessoalAuditOutboxEvent.count({
        where: { status: PENDING_AUDIT_OUTBOX_STATUS },
      }),
    };
  }
}

type UnionCandidate = { id: string; name: string; base_date: Date | null; organization_id: string };
type NotificationCandidate = {
  user_id: string;
  regarding: string;
  regarding_id: string;
  title: string;
  message: string;
  reference_date: Date;
  organization_id: string;
};

export interface UnionNotificationRunResult {
  organizations: number;
  unionsMatched: number;
  notificationsCreated: number;
  duplicatesSkipped: number;
}

export class UnionNotificationService {
  constructor(private readonly prisma: PessoalNotificationPrisma) {}

  async runForDate(input: { now: Date }): Promise<UnionNotificationRunResult> {
    const organizationRows = await this.prisma.unionPessoal.findMany({
      where: { base_date: { not: null } },
      select: { organization_id: true },
      distinct: ["organization_id"],
      orderBy: { organization_id: "asc" },
    });
    const result: UnionNotificationRunResult = {
      organizations: organizationRows.length,
      unionsMatched: 0,
      notificationsCreated: 0,
      duplicatesSkipped: 0,
    };
    for (const row of organizationRows) {
      await this.processOrganization(String(row.organization_id), input.now, result);
    }
    return result;
  }

  private async processOrganization(
    organizationId: string,
    now: Date,
    result: UnionNotificationRunResult,
  ): Promise<void> {
    const [permissions, unions] = await Promise.all([
      this.prisma.permission.findMany({
        where: {
          organization_id: organizationId,
          pessoal: { gte: 1 },
          // users.status é "active"/"inactive" (user-service); "Ativo" é de clients.
          user: { organization_id: organizationId, status: "active" },
        },
        select: { user_id: true },
      }),
      this.prisma.unionPessoal.findMany({
        where: { organization_id: organizationId, base_date: { not: null } },
        select: { id: true, name: true, base_date: true, organization_id: true },
        orderBy: { name: "asc" },
      }),
    ]);
    const userIds = permissions.map((permission) => String(permission.user_id));
    const matchingUnions = getMatchingUnionNotifications(unions as UnionCandidate[], now);
    result.unionsMatched += matchingUnions.length;
    if (userIds.length === 0 || matchingUnions.length === 0) return;
    const unionIds = [...new Set(matchingUnions.map((candidate) => candidate.regarding_id))];
    const titles = [...new Set(matchingUnions.map((candidate) => candidate.title))];
    const referenceDates = [
      ...new Set(matchingUnions.map((candidate) => candidate.reference_date.toISOString())),
    ].map((date) => new Date(date));
    const existingNotifications = await this.prisma.pessoalNotification.findMany({
      where: {
        organization_id: organizationId,
        regarding: UNION_REGARDING,
        user_id: { in: userIds },
        regarding_id: { in: unionIds },
        title: { in: titles },
        reference_date: { in: referenceDates },
      },
      select: { user_id: true, regarding_id: true, title: true, reference_date: true },
    });
    const existingKeys = new Set(
      existingNotifications.map((notification) =>
        notificationKey(
          String(notification.user_id),
          String(notification.regarding_id),
          String(notification.title),
          notification.reference_date as Date,
        ),
      ),
    );
    const createData: NotificationCandidate[] = [];
    for (const candidate of matchingUnions) {
      for (const userId of userIds) {
        const key = notificationKey(
          userId,
          candidate.regarding_id,
          candidate.title,
          candidate.reference_date,
        );
        if (existingKeys.has(key)) {
          result.duplicatesSkipped += 1;
          continue;
        }
        createData.push({ ...candidate, user_id: userId });
        existingKeys.add(key);
      }
    }
    for (let index = 0; index < createData.length; index += NOTIFICATION_CREATE_CHUNK_SIZE) {
      const createResult = await this.prisma.pessoalNotification.createMany({
        data: createData.slice(index, index + NOTIFICATION_CREATE_CHUNK_SIZE),
        skipDuplicates: true,
      });
      result.notificationsCreated += createResult.count;
    }
  }
}

function getMatchingUnionNotifications(
  unions: UnionCandidate[],
  now: Date,
): Omit<NotificationCandidate, "user_id">[] {
  const tomorrow = startOfUtcDay(addUtcDays(now, 1));
  const monthAgoFromTomorrow = startOfUtcDay(addUtcMonths(tomorrow, -1));
  const candidates: Omit<NotificationCandidate, "user_id">[] = [];
  for (const union of unions) {
    if (!union.base_date) continue;
    if (hasSameUtcMonthDay(union.base_date, tomorrow)) {
      candidates.push({
        regarding: UNION_REGARDING,
        regarding_id: union.id,
        title: "Sindicato prestes a vencer",
        message: "Data base sera alcancada amanha.",
        reference_date: tomorrow,
        organization_id: union.organization_id,
      });
    }
    if (hasSameUtcMonthDay(union.base_date, monthAgoFromTomorrow)) {
      candidates.push({
        regarding: UNION_REGARDING,
        regarding_id: union.id,
        title: "Sindicato vencido",
        message: "Data base foi alcancada no mes passado.",
        reference_date: monthAgoFromTomorrow,
        organization_id: union.organization_id,
      });
    }
  }
  return candidates;
}

function addUtcDays(value: Date, days: number): Date {
  const out = new Date(value);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

function addUtcMonths(value: Date, months: number): Date {
  const out = new Date(value);
  out.setUTCMonth(out.getUTCMonth() + months);
  return out;
}

function startOfUtcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function hasSameUtcMonthDay(left: Date, right: Date): boolean {
  return left.getUTCMonth() === right.getUTCMonth() && left.getUTCDate() === right.getUTCDate();
}

function notificationKey(userId: string, regardingId: string, title: string, referenceDate: Date) {
  return `${userId}|${regardingId}|${title}|${referenceDate.toISOString()}`;
}
