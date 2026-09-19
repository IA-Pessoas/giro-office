import { error as logError, ServiceError } from "@workspace/shared";

import type { Prisma, PrismaClient } from "../generated/prisma/client.js";

export type TriageAuditPrisma = Pick<
  PrismaClient,
  "$executeRaw" | "$transaction" | "triageCompetence" | "triageCompetenceHistory"
>;

export interface TriageAuditAuthContext {
  userId: string;
  organizationId: string;
  permission?: number;
  modules?: Record<string, number>;
}

export interface ListTriageAuditInput {
  competenceId: string;
  page: number;
  pageSize: number;
}

export interface TriageAuditItem {
  id: string;
  action: string;
  actor: {
    id: string;
    name: string;
    full_name: string | null;
  };
  competence: string;
  occurred_at: string;
  context: {
    before: unknown;
    after: unknown;
  };
}

export interface TriageAuditTimeline {
  items: TriageAuditItem[];
  total: number;
  page: number;
  page_size: number;
}

export interface TriageAuditReconcileResult {
  reconciled: number;
}

const historySelect = {
  id: true,
  action: true,
  before_data: true,
  after_data: true,
  created_at: true,
  competence: { select: { competence: true } },
  actor: { select: { id: true, name: true, full_name: true } },
} as const;

function modulePermission(auth: TriageAuditAuthContext): number {
  return auth.modules ? (auth.modules.triagem ?? 0) : (auth.permission ?? 0);
}

function requireContext(auth: TriageAuditAuthContext): void {
  if (!auth.userId || !auth.organizationId) {
    throw new ServiceError(400, "Contexto autenticado incompleto.");
  }
}

function requireViewPermission(auth: TriageAuditAuthContext): void {
  if (modulePermission(auth) < 1) {
    throw new ServiceError(403, "Permissão insuficiente para consultar a Triagem.");
  }
}

function requireWritePermission(auth: TriageAuditAuthContext): void {
  if (modulePermission(auth) < 2) {
    throw new ServiceError(403, "Permissão insuficiente para reconciliar a auditoria.");
  }
}

function toJsonValue(value: Prisma.JsonValue | null): unknown {
  return value === null ? null : value;
}

export class TriageAuditService {
  constructor(private readonly prisma: TriageAuditPrisma) {}

  async listTimeline(
    input: ListTriageAuditInput,
    auth: TriageAuditAuthContext,
  ): Promise<TriageAuditTimeline> {
    requireContext(auth);
    requireViewPermission(auth);
    if (!Number.isInteger(input.page) || input.page < 1) {
      throw new ServiceError(400, "Página inválida.");
    }
    if (!Number.isInteger(input.pageSize) || input.pageSize < 1 || input.pageSize > 100) {
      throw new ServiceError(400, "Tamanho de página inválido.");
    }

    return this.withOrganization(auth, async (transaction) => {
      const competence = await transaction.triageCompetence.findFirst({
        where: { id: input.competenceId, organization_id: auth.organizationId },
        select: { id: true },
      });
      if (!competence) {
        throw new ServiceError(404, "Competência da Triagem não encontrada.");
      }

      const [total, records] = await Promise.all([
        transaction.triageCompetenceHistory.count({
          where: { organization_id: auth.organizationId, competence_id: input.competenceId },
        }),
        transaction.triageCompetenceHistory.findMany({
          where: { organization_id: auth.organizationId, competence_id: input.competenceId },
          orderBy: [{ created_at: "desc" }, { id: "desc" }],
          skip: (input.page - 1) * input.pageSize,
          take: input.pageSize,
          select: historySelect,
        }),
      ]);

      return {
        items: records.map((record) => ({
          id: record.id,
          action: record.action,
          actor: record.actor,
          competence: record.competence.competence,
          occurred_at: record.created_at.toISOString(),
          context: {
            before: toJsonValue(record.before_data),
            after: toJsonValue(record.after_data),
          },
        })),
        total,
        page: input.page,
        page_size: input.pageSize,
      };
    });
  }

  async reconcile(auth: TriageAuditAuthContext): Promise<TriageAuditReconcileResult> {
    requireContext(auth);
    requireWritePermission(auth);

    try {
      return await this.withOrganization(auth, async (transaction) => {
        const reconciled = await transaction.$executeRaw`
          INSERT INTO "triagem.outbox_events" (
            id,
            event_key,
            aggregate_type,
            aggregate_id,
            competence_id,
            organization_id,
            event_type,
            payload,
            occurred_at
          )
          SELECT
            gen_random_uuid()::text,
            history.idempotency_key,
            'triage_competence',
            history.competence_id,
            history.competence_id,
            history.organization_id,
            'triage.competence.' || history.action,
            jsonb_build_object(
              'actor_user_id', history.actor_user_id,
              'before', history.before_data,
              'after', history.after_data
            ),
            history.created_at
          FROM "triagem.competence_history" AS history
          LEFT JOIN "triagem.outbox_events" AS event
            ON event.event_key = history.idempotency_key
          WHERE history.organization_id = ${auth.organizationId}
            AND event.id IS NULL
          ON CONFLICT (event_key) DO NOTHING
        `;

        return { reconciled: Number(reconciled) };
      });
    } catch (error: unknown) {
      logError("Erro ao reconciliar a outbox de auditoria da Triagem", { err: error });
      if (error instanceof ServiceError) throw error;
      throw new ServiceError(500, "Erro ao reconciliar a auditoria da Triagem.", error);
    }
  }

  private async withOrganization<T>(
    auth: TriageAuditAuthContext,
    callback: (transaction: TriageAuditPrisma) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`SET LOCAL ROLE "giro_user_runtime"`;
      await transaction.$executeRaw`SELECT set_config('app.organization_id', ${auth.organizationId}, true)`;
      return callback(transaction as unknown as TriageAuditPrisma);
    });
  }
}
