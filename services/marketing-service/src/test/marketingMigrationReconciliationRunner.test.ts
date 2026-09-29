import { describe, expect, it, vi } from "vitest";

import {
  createConfiguredMarketingMigrationReconciliationRunner,
  MarketingMigrationReconciliationRunner,
} from "../services/marketingMigrationReconciliationRunner.js";

const CASTELO_ORGANIZATION_ID = "e8048d1c-0830-45d7-84de-68e20abd685b";

function createPrisma() {
  const transaction = {
    marketingMigrationReconciliationRun: {
      create: vi.fn().mockResolvedValue({ id: "run-1" }),
    },
    marketingMigrationReconciliationDataset: {
      create: vi.fn(async ({ data }: { data: { dataset: string } }) => ({ id: data.dataset })),
    },
    marketingMigrationReconciliationItem: { createMany: vi.fn() },
    marketingMigrationReconciliationDecision: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
  return {
    transaction,
    marketingMigrationReconciliationDecision: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    prisma: {
      marketingMigrationReconciliationDecision: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      $transaction: vi.fn(async (operation: (tx: typeof transaction) => Promise<string>) =>
        operation(transaction),
      ),
    },
  };
}

describe("MarketingMigrationReconciliationRunner", () => {
  it("fails closed without a configured source and does not create a run", async () => {
    const { prisma, transaction } = createPrisma();
    const runner = new MarketingMigrationReconciliationRunner(prisma as never);

    await expect(
      runner.reconcile({
        organizationId: CASTELO_ORGANIZATION_ID,
        sourceOrganizationId: CASTELO_ORGANIZATION_ID,
        executeDryRun: vi.fn(),
        getImportedTotals: vi.fn(),
      }),
    ).rejects.toMatchObject({ statusCode: 503 });
    expect(transaction.marketingMigrationReconciliationRun.create).not.toHaveBeenCalled();
  });

  it("persists seven dataset records but keeps datasets absent from the dry-run as not-run", async () => {
    const { prisma, transaction } = createPrisma();
    const runner = new MarketingMigrationReconciliationRunner(prisma as never);
    const digest = `sha256:${"d".repeat(64)}`;

    await expect(
      runner.reconcile({
        organizationId: CASTELO_ORGANIZATION_ID,
        sourceOrganizationId: CASTELO_ORGANIZATION_ID,
        sourceDir: process.cwd(),
        executeDryRun: vi.fn().mockResolvedValue({
          complete: false,
          sourceCountsByTable: {
            "tb_mkt.eventos_edicoes": { prepared: 5, notEmitted: 0, quarantine: 1 },
          },
          quarantineItems: [
            {
              sourceTable: "tb_mkt.eventos_edicoes",
              stepId: "edition-insert",
              sourceIdentityDigest: digest,
              field: "evento_id",
              reasonCode: "MKT_EDITION_EVENT_AMBIGUOUS",
            },
          ],
        }),
        getImportedTotals: vi.fn().mockResolvedValue({ eventos_edicoes: 4 }),
      }),
    ).resolves.toEqual({ runId: "run-1", complete: false });

    expect(transaction.marketingMigrationReconciliationDataset.create).toHaveBeenCalledTimes(7);
    expect(transaction.marketingMigrationReconciliationDataset.create).toHaveBeenCalledWith({
      data: {
        run_id: "run-1",
        dataset: "eventos_edicoes",
        status: "completed",
        prepared_total: 5,
        imported_total: 4,
        quarantined_total: 1,
      },
      select: { id: true },
    });
    expect(transaction.marketingMigrationReconciliationDataset.create).toHaveBeenCalledWith({
      data: {
        run_id: "run-1",
        dataset: "ai_usage",
        status: "not_run",
        prepared_total: null,
        imported_total: null,
        quarantined_total: null,
      },
      select: { id: true },
    });
    expect(transaction.marketingMigrationReconciliationItem.createMany).toHaveBeenCalledWith({
      data: [
        {
          dataset_id: "eventos_edicoes",
          source_table: "tb_mkt.eventos_edicoes",
          source_identity_digest: digest,
          step_id: "edition-insert",
          field: "evento_id",
          reason_code: "MKT_EDITION_EVENT_AMBIGUOUS",
        },
      ],
    });
  });

  it("rejects a selected organization outside the tenant mapped by V4", async () => {
    const { prisma, transaction } = createPrisma();
    const runner = new MarketingMigrationReconciliationRunner(prisma as never);
    const executeDryRun = vi.fn();
    const getImportedTotals = vi.fn();

    await expect(
      runner.reconcile({
        organizationId: "10000000-0000-4000-8000-000000000001",
        sourceOrganizationId: CASTELO_ORGANIZATION_ID,
        sourceDir: process.cwd(),
        executeDryRun,
        getImportedTotals,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(prisma.marketingMigrationReconciliationDecision.findMany).not.toHaveBeenCalled();
    expect(executeDryRun).not.toHaveBeenCalled();
    expect(getImportedTotals).not.toHaveBeenCalled();
    expect(transaction.marketingMigrationReconciliationRun.create).not.toHaveBeenCalled();
  });

  it("loads the configured V4 adapter and still fails closed without a source directory", async () => {
    const { prisma, transaction } = createPrisma();
    const configuredRunner = createConfiguredMarketingMigrationReconciliationRunner(
      prisma as never,
      { getImportedTotals: vi.fn() },
    );

    await expect(configuredRunner.reconcile(CASTELO_ORGANIZATION_ID)).rejects.toMatchObject({
      statusCode: 503,
    });
    expect(transaction.marketingMigrationReconciliationRun.create).not.toHaveBeenCalled();
  });
});
