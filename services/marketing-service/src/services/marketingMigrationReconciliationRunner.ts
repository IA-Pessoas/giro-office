import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
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

const SOURCE_BY_DATASET = {
  eventos: "tb_mkt.eventos",
  eventos_edicoes: "tb_mkt.eventos_edicoes",
  eventos_feedbacks_periodos: "tb_mkt.eventos_feedbacks_periodos",
  eventos_feedbacks: "tb_mkt.eventos_feedbacks",
  redes_sociais: "tb_mkt.redes_sociais",
  senhas: "tb_mkt.senhas",
} as const;

interface DryRunItem {
  sourceTable: string;
  stepId: string;
  sourceIdentityDigest: string;
  field: string | null;
  reasonCode: string;
}

interface DryRunReport {
  complete: boolean;
  sourceCountsByTable: Record<string, { prepared: number; notEmitted: number; quarantine: number }>;
  quarantineItems: DryRunItem[];
}

export interface MarketingMigrationReconciliationTotals {
  prepared: number;
  imported: number;
  quarantined: number;
}

export class MarketingMigrationReconciliationRunner {
  public constructor(
    private readonly prisma: Pick<
      PrismaClient,
      "$transaction" | "marketingMigrationReconciliationDecision"
    >,
  ) {}

  public async reconcile(input: {
    organizationId: string;
    sourceOrganizationId: string;
    sourceDir?: string;
    executeDryRun: (
      sourceDir: string,
      resolutions: Array<{ sourceIdentityDigest: string; canonicalTargetId: string }>,
    ) => Promise<DryRunReport>;
    getImportedTotals: (
      organizationId: string,
    ) => Promise<Partial<Record<(typeof DATASETS)[number], number>>>;
  }): Promise<{ runId: string; complete: boolean }> {
    if (input.organizationId !== input.sourceOrganizationId) {
      throw new ServiceError(409, "A origem V4 ainda não atende à organização selecionada.");
    }
    if (!input.sourceDir || input.sourceDir.trim().length === 0) {
      throw new ServiceError(503, "Origem V4 não configurada; reconciliação não executada.");
    }
    try {
      const sourceDirectory = await stat(input.sourceDir);
      if (!sourceDirectory.isDirectory()) throw new Error("invalid-directory");
      await access(input.sourceDir, constants.R_OK);
    } catch {
      throw new ServiceError(503, "Origem V4 indisponível; reconciliação não executada.");
    }

    const [decisions, importedTotals] = await Promise.all([
      this.prisma.marketingMigrationReconciliationDecision.findMany({
        where: { organization_id: input.organizationId, dataset: "eventos_edicoes" },
        select: {
          source_table: true,
          source_identity_digest: true,
          canonical_target_id: true,
        },
      }),
      input.getImportedTotals(input.organizationId),
    ]);
    const resolutions = decisions
      .filter(({ source_table }) => source_table === "tb_mkt.eventos_edicoes")
      .map(({ source_identity_digest, canonical_target_id }) => ({
        sourceIdentityDigest: source_identity_digest,
        canonicalTargetId: canonical_target_id,
      }));
    const report = await input.executeDryRun(input.sourceDir, resolutions);
    validateReport(report);

    const runId = await this.prisma.$transaction(async (transaction) => {
      const run = await transaction.marketingMigrationReconciliationRun.create({
        data: { organization_id: input.organizationId },
        select: { id: true },
      });
      for (const dataset of DATASETS) {
        const sourceTable = SOURCE_BY_DATASET[dataset as keyof typeof SOURCE_BY_DATASET];
        const sourceTotals = sourceTable ? report.sourceCountsByTable[sourceTable] : undefined;
        const datasetRecord = await transaction.marketingMigrationReconciliationDataset.create({
          data: {
            run_id: run.id,
            dataset,
            status: sourceTotals === undefined ? "not_run" : "completed",
            prepared_total: sourceTotals?.prepared ?? null,
            imported_total: importedTotals[dataset] ?? null,
            quarantined_total: sourceTotals?.quarantine ?? null,
          },
          select: { id: true },
        });
        const items = report.quarantineItems
          .filter((item) => item.sourceTable === sourceTable)
          .map((item) => ({
            dataset_id: datasetRecord.id,
            source_table: item.sourceTable,
            source_identity_digest: item.sourceIdentityDigest,
            step_id: item.stepId,
            field: item.field,
            reason_code: item.reasonCode,
          }));
        if (items.length > 0) {
          await transaction.marketingMigrationReconciliationItem.createMany({ data: items });
        }
      }
      return run.id;
    });

    return { runId, complete: report.complete };
  }
}

export function createConfiguredMarketingMigrationReconciliationRunner(
  prisma: Pick<PrismaClient, "$transaction" | "marketingMigrationReconciliationDecision">,
  input: {
    sourceDir?: string;
    getImportedTotals: (organizationId: string) => Promise<Partial<Record<string, number>>>;
  },
): { reconcile(organizationId: string): Promise<{ runId: string; complete: boolean }> } {
  const runner = new MarketingMigrationReconciliationRunner(prisma);
  return {
    async reconcile(organizationId) {
      const migrationScriptUrl = new URL(
        "../../../../docs/migration/v4/scripts/dry-run.mjs",
        import.meta.url,
      ).href;
      const migrationScript = (await import(migrationScriptUrl)) as {
        MIGRATION_ORGANIZATION_ID: string;
        runConfiguredDryRun(input: {
          sourceDir: string;
          organizationId: string;
          resolutions: Array<{ sourceIdentityDigest: string; canonicalTargetId: string }>;
        }): Promise<DryRunReport>;
      };

      return runner.reconcile({
        organizationId,
        sourceOrganizationId: migrationScript.MIGRATION_ORGANIZATION_ID,
        sourceDir: input.sourceDir,
        executeDryRun: (sourceDir, resolutions) =>
          migrationScript.runConfiguredDryRun({
            sourceDir,
            organizationId: migrationScript.MIGRATION_ORGANIZATION_ID,
            resolutions,
          }),
        getImportedTotals: input.getImportedTotals,
      });
    },
  };
}

function validateReport(report: DryRunReport): void {
  if (
    report === null ||
    typeof report !== "object" ||
    typeof report.complete !== "boolean" ||
    report.sourceCountsByTable === null ||
    typeof report.sourceCountsByTable !== "object" ||
    !Array.isArray(report.quarantineItems)
  ) {
    throw new Error("MARKETING_MIGRATION_DRY_RUN_REPORT_INVALID");
  }
  for (const item of report.quarantineItems) {
    if (
      !Object.values(SOURCE_BY_DATASET).includes(
        item.sourceTable as (typeof SOURCE_BY_DATASET)[keyof typeof SOURCE_BY_DATASET],
      ) ||
      !/^sha256:[a-f0-9]{64}$/.test(item.sourceIdentityDigest) ||
      !/^[A-Za-z0-9_.-]+$/.test(item.stepId) ||
      !/^[A-Z0-9_.-]+$/.test(item.reasonCode) ||
      (item.field !== null && !/^[A-Za-z0-9_.-]+$/.test(item.field))
    ) {
      throw new Error("MARKETING_MIGRATION_DRY_RUN_REPORT_INVALID");
    }
  }
}
