import { createHash, randomUUID } from "node:crypto";

import { error as logError, ServiceError } from "@workspace/shared";
import { Prisma, type PrismaClient } from "../generated/prisma/client.js";
import type {
  ApplyGroupAssignmentPreviewBody,
  CreateGroupAssignmentPreviewBody,
  GroupAssignmentEligibleQuery,
  GroupAssignmentPreviewQuery,
} from "../schemas/groupAssignment.schemas.js";
import type { PessoalAuditChangeInput, PessoalAuditService } from "./pessoalAuditService.js";
import {
  PESSOAL_READ_PERMISSION,
  PESSOAL_WRITE_PERMISSION,
  type PessoalAuthContext,
  requireMinimumPermission,
  requireUserId,
} from "./pessoalServiceTypes.js";

const PREVIEW_TTL_MS = 15 * 60 * 1000;
const ACTIVE_CLIENT_STATUS = "Ativo";
const OUTCOME_CHANGED = "CHANGED";
const OUTCOME_NO_OP = "NO_OP";
const OUTCOME_SKIPPED = "SKIPPED";
const SKIP_CLIENT_NOT_FOUND = "CLIENT_NOT_FOUND";
const SKIP_CLIENT_NOT_ACTIVE = "CLIENT_NOT_ACTIVE";
const SKIP_CLIENT_NOT_PESSOAL = "CLIENT_NOT_PESSOAL";
const SKIP_PAYROLL_NOT_FOUND = "PAYROLL_NOT_FOUND";
const PENDING_AUDIT_OUTBOX_STATUS = "pending";
const PROCESSED_AUDIT_OUTBOX_STATUS = "processed";
const AUDIT_OUTBOX_RECONCILIATION_LIMIT = 100;

type PreviewTotals = {
  changed: number;
  no_op: number;
  skipped: number;
  requested: number;
};

type PreviewDetail = {
  id: string;
  client_id: string;
  client_name: string | null;
  payroll_id: string | null;
  previous_group_id: string | null;
  previous_group_name: string | null;
  outcome: string;
  skip_reason: string | null;
};

const previewSelect = {
  id: true,
  fingerprint: true,
  version: true,
  totals: true,
  expires_at: true,
  applied_at: true,
  target_group_id: true,
  targetGroup: { select: { id: true, name: true, archived_at: true } },
} as const;

function isPreviewTotals(value: unknown): value is PreviewTotals {
  if (!value || typeof value !== "object") return false;
  const totals = value as Record<string, unknown>;
  return ["changed", "no_op", "skipped", "requested"].every(
    (key) => typeof totals[key] === "number",
  );
}

function isPessoalAuditChangeInput(value: unknown): value is PessoalAuditChangeInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  return ["organizationId", "userId", "action", "referring", "referringId"].every((field) => {
    const fieldValue = input[field];
    return typeof fieldValue === "string" && fieldValue.trim().length > 0;
  });
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function toPage<T>(data: T[], total: number, page: number, limit: number) {
  return { data, total, page, limit, hasMore: page * limit < total };
}

function toPreviewDetail(detail: PreviewDetail) {
  return {
    client_id: detail.client_id,
    client_name: detail.client_name,
    payroll_id: detail.payroll_id,
    previous_group_id: detail.previous_group_id,
    previous_group_name: detail.previous_group_name,
    outcome: detail.outcome,
    skip_reason: detail.skip_reason,
  };
}

export class GroupAssignmentService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly auditService: PessoalAuditService,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async listEligible(
    context: PessoalAuthContext,
    query: GroupAssignmentEligibleQuery,
  ): Promise<
    ReturnType<
      typeof toPage<{
        client_id: string;
        client_name: string;
        payroll_id: string;
        group_id: string | null;
        group_name: string | null;
      }>
    >
  > {
    requireMinimumPermission(context, PESSOAL_READ_PERMISSION);
    const offset = (query.page - 1) * query.limit;
    const rows = await this.prisma.$queryRaw<
      Array<{
        client_id: string;
        client_name: string;
        payroll_id: string;
        group_id: string | null;
        group_name: string | null;
        total: number | bigint;
      }>
    >(Prisma.sql`
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
        ${query.search ? Prisma.sql`AND client."name" ILIKE ${`%${query.search}%`}` : Prisma.empty}
      ORDER BY client."name" ASC, client."id" ASC
      LIMIT ${query.limit} OFFSET ${offset}
    `);
    return toPage(
      rows.map(({ total: _total, ...row }) => row),
      rows[0] ? Number(rows[0].total) : 0,
      query.page,
      query.limit,
    );
  }

  async createPreview(
    context: PessoalAuthContext,
    body: CreateGroupAssignmentPreviewBody,
  ): Promise<Awaited<ReturnType<GroupAssignmentService["detailPreview"]>>> {
    try {
      requireMinimumPermission(context, PESSOAL_WRITE_PERMISSION);
      const userId = requireUserId(context);
      const targetGroup = await this.prisma.pessoalGroup.findFirst({
        where: { id: body.group_id, organization_id: context.organizationId, archived_at: null },
        select: { id: true, name: true },
      });
      if (!targetGroup) throw new ServiceError(409, "Grupo de destino inexistente ou arquivado.");

      const [clients, payrolls] = await Promise.all([
        this.prisma.client.findMany({
          where: { organization_id: context.organizationId, id: { in: body.client_ids } },
          select: { id: true, name: true, status: true, pessoal: true },
        }),
        this.prisma.payroll.findMany({
          where: { organization_id: context.organizationId, client_id: { in: body.client_ids } },
          select: {
            id: true,
            client_id: true,
            group_id: true,
            group: { select: { name: true } },
          },
        }),
      ]);
      const clientsById = new Map(clients.map((client) => [client.id, client]));
      const payrollsByClientId = new Map(payrolls.map((payroll) => [payroll.client_id, payroll]));
      const details = body.client_ids.map((clientId) => {
        const client = clientsById.get(clientId);
        const payroll = payrollsByClientId.get(clientId);
        if (!client) {
          return {
            client_id: clientId,
            outcome: OUTCOME_SKIPPED,
            skip_reason: SKIP_CLIENT_NOT_FOUND,
          };
        }
        if (client.status !== ACTIVE_CLIENT_STATUS) {
          return {
            client_id: clientId,
            client_name: client.name,
            outcome: OUTCOME_SKIPPED,
            skip_reason: SKIP_CLIENT_NOT_ACTIVE,
          };
        }
        if (client.pessoal !== true) {
          return {
            client_id: clientId,
            client_name: client.name,
            outcome: OUTCOME_SKIPPED,
            skip_reason: SKIP_CLIENT_NOT_PESSOAL,
          };
        }
        if (!payroll) {
          return {
            client_id: clientId,
            client_name: client.name,
            outcome: OUTCOME_SKIPPED,
            skip_reason: SKIP_PAYROLL_NOT_FOUND,
          };
        }
        return {
          client_id: clientId,
          client_name: client.name,
          payroll_id: payroll.id,
          previous_group_id: payroll.group_id,
          previous_group_name: payroll.group?.name ?? null,
          outcome: payroll.group_id === targetGroup.id ? OUTCOME_NO_OP : OUTCOME_CHANGED,
        };
      });
      const totals: PreviewTotals = {
        changed: details.filter((detail) => detail.outcome === OUTCOME_CHANGED).length,
        no_op: details.filter((detail) => detail.outcome === OUTCOME_NO_OP).length,
        skipped: details.filter((detail) => detail.outcome === OUTCOME_SKIPPED).length,
        requested: details.length,
      };
      const previewId = randomUUID();
      const expiresAt = new Date(this.now().getTime() + PREVIEW_TTL_MS);
      const fingerprint = hash({
        group_id: targetGroup.id,
        details: [...details].sort((left, right) => left.client_id.localeCompare(right.client_id)),
      });
      await this.prisma.pessoalGroupAssignmentPreview.create({
        data: {
          id: previewId,
          organization_id: context.organizationId,
          target_group_id: targetGroup.id,
          fingerprint,
          totals: totals as unknown as Prisma.InputJsonValue,
          expires_at: expiresAt,
          created_by_id: userId,
          details: { create: details },
        },
      });
      return this.detailPreview(context, previewId, { page: 1, limit: 25 });
    } catch (err: unknown) {
      logError("Erro ao criar previa persistida de atribuicao em lote", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro ao criar previa de atribuicao em lote.", err);
    }
  }

  async detailPreview(
    context: PessoalAuthContext,
    previewId: string,
    query: GroupAssignmentPreviewQuery,
  ): Promise<{
    preview_id: string;
    fingerprint: string;
    version: number;
    expires_at: Date;
    ttl_seconds: number;
    applied_at: Date | null;
    target_group: { id: string; name: string };
    totals: PreviewTotals;
    details: ReturnType<typeof toPage<ReturnType<typeof toPreviewDetail>>>;
  }> {
    requireMinimumPermission(context, PESSOAL_READ_PERMISSION);
    const preview = await this.prisma.pessoalGroupAssignmentPreview.findFirst({
      where: { id: previewId, organization_id: context.organizationId },
      select: previewSelect,
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
          id: true,
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
      details: toPage(details.map(toPreviewDetail), total, query.page, query.limit),
    };
  }

  async apply(
    context: PessoalAuthContext,
    body: ApplyGroupAssignmentPreviewBody,
    idempotencyKey: string,
  ): Promise<{
    preview_id: string;
    changed: number;
    no_op: number;
    skipped: number;
    idempotent: boolean;
  }> {
    try {
      requireMinimumPermission(context, PESSOAL_WRITE_PERMISSION);
      const userId = requireUserId(context);
      const commandHash = hash({ preview_id: body.preview_id, fingerprint: body.fingerprint });
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
            response: previous.response_snapshot as unknown as {
              preview_id: string;
              changed: number;
              no_op: number;
              skipped: number;
            },
            idempotent: true,
          };
        }
        const preview = await tx.pessoalGroupAssignmentPreview.findFirst({
          where: { id: body.preview_id, organization_id: context.organizationId },
          select: previewSelect,
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
        const clientsById = new Map(clients.map((client) => [client.id, client]));
        const payrollsByClientId = new Map(payrolls.map((payroll) => [payroll.client_id, payroll]));
        for (const detail of actionable) {
          const client = clientsById.get(detail.client_id);
          const payroll = payrollsByClientId.get(detail.client_id);
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
          if (detail.outcome !== OUTCOME_CHANGED) continue;
          if (detail.previous_group_id === null)
            throw new ServiceError(409, "Previa obsoleta. Gere uma nova previa.");
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
          requestId: context.requestId,
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
            payload: auditPayload as unknown as Prisma.InputJsonValue,
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
            response_snapshot: response as unknown as Prisma.InputJsonValue,
          },
        });
        return { response, idempotent: false, auditPayload, outboxId: outbox.id };
      });
      if (result.idempotent) return { ...result.response, idempotent: true };
      if (!result.auditPayload || !result.outboxId) {
        throw new ServiceError(500, "Resultado de auditoria da atribuicao em lote invalido.");
      }
      const auditRecorded = await this.auditService.recordChange(result.auditPayload);
      if (auditRecorded) {
        await this.prisma.pessoalAuditOutboxEvent.update({
          where: { id: result.outboxId },
          data: { status: PROCESSED_AUDIT_OUTBOX_STATUS, processed_at: this.now() },
        });
      }
      return { ...result.response, idempotent: false };
    } catch (err: unknown) {
      logError("Erro ao aplicar atribuicao de grupo em lote", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro ao aplicar atribuicao de grupo em lote.", err);
    }
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
      if (!isPessoalAuditChangeInput(event.payload)) continue;
      if (!(await this.auditService.recordChange(event.payload))) continue;

      const updated = await this.prisma.pessoalAuditOutboxEvent.updateMany({
        where: { id: event.id, status: PENDING_AUDIT_OUTBOX_STATUS },
        data: { status: PROCESSED_AUDIT_OUTBOX_STATUS, processed_at: this.now() },
      });
      processed += updated.count;
    }

    const pending = await this.prisma.pessoalAuditOutboxEvent.count({
      where: { status: PENDING_AUDIT_OUTBOX_STATUS },
    });
    return { processed, pending };
  }
}
