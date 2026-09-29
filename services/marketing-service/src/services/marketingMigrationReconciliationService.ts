import { ServiceError } from "@workspace/shared";
import type { PrismaClient } from "../generated/prisma/client.js";

const DATASETS = [
  "eventos",
  "eventos_edicoes",
  "eventos_feedbacks_periodos",
  "eventos_feedbacks",
  "redes_sociais",
  "senhas",
  "ai_usage",
] as const;

type DatasetName = (typeof DATASETS)[number];

export interface ResolveMarketingAssociationInput {
  organizationId: string;
  dataset: DatasetName;
  sourceTable: string;
  sourceIdentityDigest: string;
  stepId: string;
  canonicalTargetId: string;
  actorId: string;
  requestId: string;
}

export class MarketingMigrationReconciliationService {
  public constructor(
    private readonly prisma: Pick<
      PrismaClient,
      | "marketingMigrationReconciliationRun"
      | "marketingMigrationReconciliationDecision"
      | "marketingEvent"
      | "marketingEventEdition"
      | "marketingAiUsageControl"
    >,
  ) {}

  public async getReconciliation(organizationId: string): Promise<{
    organizationId: string;
    lastRunAt: string | null;
    datasets: Array<{
      dataset: DatasetName;
      status: string;
      totals: { prepared: number; imported: number; quarantined: number } | null;
      items: Array<{
        sourceTable: string;
        sourceIdentityDigest: string;
        stepId: string;
        field: string | null;
        reasonCode: string;
        resolution: { canonicalTargetId: string; actorId: string; createdAt: string } | null;
      }>;
      decisions: Array<{
        sourceTable: string;
        sourceIdentityDigest: string;
        stepId: string;
        canonicalTargetId: string;
        actorId: string;
        createdAt: string;
      }>;
    }>;
  }> {
    const latestRun = await this.prisma.marketingMigrationReconciliationRun.findFirst({
      where: { organization_id: organizationId },
      orderBy: { created_at: "desc" },
      include: { datasets: { include: { items: true } } },
    });
    const decisions = await this.prisma.marketingMigrationReconciliationDecision.findMany({
      where: { organization_id: organizationId },
      select: {
        dataset: true,
        source_table: true,
        source_identity_digest: true,
        step_id: true,
        canonical_target_id: true,
        actor_id: true,
        created_at: true,
      },
    });
    const decisionByItem = new Map(
      decisions.map((decision) => [
        JSON.stringify([
          decision.dataset,
          decision.source_table,
          decision.source_identity_digest,
          decision.step_id,
        ]),
        decision,
      ]),
    );
    const datasetByName = new Map(latestRun?.datasets.map((dataset) => [dataset.dataset, dataset]));

    return {
      organizationId,
      lastRunAt: latestRun?.created_at.toISOString() ?? null,
      datasets: DATASETS.map((dataset) => {
        const snapshot = datasetByName.get(dataset);
        return {
          dataset,
          status: snapshot?.status ?? "not_run",
          totals:
            snapshot?.prepared_total === null ||
            snapshot?.prepared_total === undefined ||
            snapshot.imported_total === null ||
            snapshot.imported_total === undefined ||
            snapshot.quarantined_total === null ||
            snapshot.quarantined_total === undefined
              ? null
              : {
                  prepared: snapshot.prepared_total,
                  imported: snapshot.imported_total,
                  quarantined: snapshot.quarantined_total,
                },
          items: (snapshot?.items ?? []).map((item) => {
            const decision = decisionByItem.get(
              JSON.stringify([
                dataset,
                item.source_table,
                item.source_identity_digest,
                item.step_id,
              ]),
            );
            return {
              sourceTable: item.source_table,
              sourceIdentityDigest: item.source_identity_digest,
              stepId: item.step_id,
              field: item.field,
              reasonCode: item.reason_code,
              resolution: decision
                ? {
                    canonicalTargetId: decision.canonical_target_id,
                    actorId: decision.actor_id,
                    createdAt: decision.created_at.toISOString(),
                  }
                : null,
            };
          }),
          decisions: decisions
            .filter((decision) => decision.dataset === dataset)
            .map((decision) => ({
              sourceTable: decision.source_table,
              sourceIdentityDigest: decision.source_identity_digest,
              stepId: decision.step_id,
              canonicalTargetId: decision.canonical_target_id,
              actorId: decision.actor_id,
              createdAt: decision.created_at.toISOString(),
            })),
        };
      }),
    };
  }

  public async resolveAssociation(input: ResolveMarketingAssociationInput): Promise<{
    id: string;
    createdAt: string;
  }> {
    if (
      input.dataset !== "eventos_edicoes" ||
      input.sourceTable !== "tb_mkt.eventos_edicoes" ||
      !/^sha256:[a-f0-9]{64}$/.test(input.sourceIdentityDigest)
    ) {
      throw new ServiceError(409, "Esta pendência não permite resolução de associação.");
    }

    const latestRun = await this.prisma.marketingMigrationReconciliationRun.findFirst({
      where: { organization_id: input.organizationId },
      orderBy: { created_at: "desc" },
      include: { datasets: { include: { items: true } } },
    });
    const item = latestRun?.datasets
      .find((dataset) => dataset.dataset === input.dataset)
      ?.items.find(
        (candidate) =>
          candidate.source_table === input.sourceTable &&
          candidate.source_identity_digest === input.sourceIdentityDigest &&
          candidate.step_id === input.stepId,
      );

    if (item?.reason_code !== "MKT_EDITION_EVENT_AMBIGUOUS") {
      throw new ServiceError(409, "Esta pendência não permite resolução de associação.");
    }

    const existingDecision = await this.prisma.marketingMigrationReconciliationDecision.findFirst({
      where: {
        organization_id: input.organizationId,
        dataset: input.dataset,
        source_table: input.sourceTable,
        source_identity_digest: input.sourceIdentityDigest,
        step_id: input.stepId,
      },
      select: { id: true, canonical_target_id: true, request_id: true, created_at: true },
    });
    if (existingDecision) {
      if (
        existingDecision.request_id === input.requestId &&
        existingDecision.canonical_target_id === input.canonicalTargetId
      ) {
        return { id: existingDecision.id, createdAt: existingDecision.created_at.toISOString() };
      }
      throw new ServiceError(409, "Esta pendência já possui uma decisão registrada.");
    }

    const target = await this.prisma.marketingEvent.findFirst({
      where: { id: input.canonicalTargetId, organization_id: input.organizationId },
      select: { id: true },
    });
    if (!target) throw new ServiceError(404, "Destino canônico não encontrado.");

    const decision = await this.prisma.marketingMigrationReconciliationDecision.create({
      data: {
        organization_id: input.organizationId,
        dataset: input.dataset,
        source_table: input.sourceTable,
        source_identity_digest: input.sourceIdentityDigest,
        step_id: input.stepId,
        canonical_target_id: input.canonicalTargetId,
        actor_id: input.actorId,
        request_id: input.requestId,
      },
      select: { id: true, created_at: true },
    });
    return { id: decision.id, createdAt: decision.created_at.toISOString() };
  }

  public async getCanonicalEvents(
    organizationId: string,
  ): Promise<Array<{ id: string; name: string }>> {
    return this.prisma.marketingEvent.findMany({
      where: { organization_id: organizationId },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: { id: true, name: true },
    });
  }

  public async getImportedTotals(
    organizationId: string,
  ): Promise<Partial<Record<DatasetName, number>>> {
    const [events, editions, feedbackPeriods, aiUsage] = await Promise.all([
      this.prisma.marketingEvent.count({
        where: { organization_id: organizationId, legacy_id: { not: null } },
      }),
      this.prisma.marketingEventEdition.count({
        where: { organization_id: organizationId, legacy_id: { not: null } },
      }),
      this.prisma.marketingEventEdition.count({
        where: { organization_id: organizationId, feedback_period_start: { not: null } },
      }),
      this.prisma.marketingAiUsageControl.count({
        where: { organization_id: organizationId, imported_from_legacy: true },
      }),
    ]);
    return {
      eventos: events,
      eventos_edicoes: editions,
      eventos_feedbacks_periodos: feedbackPeriods,
      ai_usage: aiUsage,
    };
  }
}
