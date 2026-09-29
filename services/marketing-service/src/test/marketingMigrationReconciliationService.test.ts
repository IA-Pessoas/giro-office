import { beforeEach, describe, expect, it, vi } from "vitest";

import { MarketingMigrationReconciliationService } from "../services/marketingMigrationReconciliationService.js";

const organizationId = "10000000-0000-4000-8000-000000000001";
const datasets = [
  "eventos",
  "eventos_edicoes",
  "eventos_feedbacks_periodos",
  "eventos_feedbacks",
  "redes_sociais",
  "senhas",
  "ai_usage",
];

function createPrisma() {
  return {
    marketingMigrationReconciliationRun: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    marketingMigrationReconciliationDecision: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
    },
    marketingEvent: {
      findFirst: vi.fn().mockResolvedValue({ id: "canonical-event-1" }),
      count: vi.fn().mockResolvedValue(0),
    },
    marketingEventEdition: {
      count: vi.fn().mockResolvedValue(0),
    },
    marketingAiUsageControl: {
      count: vi.fn().mockResolvedValue(0),
    },
  };
}

describe("MarketingMigrationReconciliationService", () => {
  let prisma: ReturnType<typeof createPrisma>;
  let service: MarketingMigrationReconciliationService;

  beforeEach(() => {
    prisma = createPrisma();
    service = new MarketingMigrationReconciliationService(prisma as never);
  });

  it("returns each dataset as not-run without presenting missing totals as zero", async () => {
    await expect(service.getReconciliation(organizationId)).resolves.toEqual({
      organizationId,
      lastRunAt: null,
      datasets: datasets.map((dataset) => ({
        dataset,
        status: "not_run",
        totals: null,
        items: [],
        decisions: [],
      })),
    });

    expect(prisma.marketingMigrationReconciliationRun.findFirst).toHaveBeenCalledWith({
      where: { organization_id: organizationId },
      orderBy: { created_at: "desc" },
      include: { datasets: { include: { items: true } } },
    });
  });

  it("counts only AI usage controls explicitly marked as legacy imports", async () => {
    prisma.marketingEvent.count.mockResolvedValueOnce(2);
    prisma.marketingEventEdition.count.mockResolvedValueOnce(3).mockResolvedValueOnce(4);
    prisma.marketingAiUsageControl.count.mockResolvedValueOnce(5);

    await expect(service.getImportedTotals(organizationId)).resolves.toEqual({
      eventos: 2,
      eventos_edicoes: 3,
      eventos_feedbacks_periodos: 4,
      ai_usage: 5,
    });
    expect(prisma.marketingAiUsageControl.count).toHaveBeenCalledWith({
      where: { organization_id: organizationId, imported_from_legacy: true },
    });
  });

  it("returns itemized snapshots and totals for the latest organization run", async () => {
    prisma.marketingMigrationReconciliationRun.findFirst.mockResolvedValue({
      id: "run-with-snapshot",
      created_at: new Date("2026-09-29T12:30:00.000Z"),
      datasets: [
        {
          dataset: "eventos_edicoes",
          status: "completed",
          prepared_total: 18,
          imported_total: 15,
          quarantined_total: 3,
          items: [
            {
              source_table: "tb_mkt.eventos_edicoes",
              source_identity_digest: `sha256:${"c".repeat(64)}`,
              step_id: "edition-insert",
              field: "evento_id",
              reason_code: "MKT_EDITION_EVENT_AMBIGUOUS",
            },
          ],
        },
      ],
    });

    const result = await service.getReconciliation(organizationId);

    expect(result.lastRunAt).toBe("2026-09-29T12:30:00.000Z");
    expect(result.datasets.find(({ dataset }) => dataset === "eventos_edicoes")).toEqual({
      dataset: "eventos_edicoes",
      status: "completed",
      totals: { prepared: 18, imported: 15, quarantined: 3 },
      decisions: [],
      items: [
        {
          sourceTable: "tb_mkt.eventos_edicoes",
          sourceIdentityDigest: `sha256:${"c".repeat(64)}`,
          stepId: "edition-insert",
          field: "evento_id",
          reasonCode: "MKT_EDITION_EVENT_AMBIGUOUS",
          resolution: null,
        },
      ],
    });
  });

  it("retains the audit history after a resolved item leaves the latest quarantine", async () => {
    const digest = `sha256:${"f".repeat(64)}`;
    prisma.marketingMigrationReconciliationRun.findFirst.mockResolvedValue({
      id: "run-after-resolution",
      created_at: new Date("2026-09-29T15:00:00.000Z"),
      datasets: [
        {
          dataset: "eventos_edicoes",
          status: "completed",
          prepared_total: 18,
          imported_total: 16,
          quarantined_total: 2,
          items: [],
        },
      ],
    });
    prisma.marketingMigrationReconciliationDecision.findMany.mockResolvedValue([
      {
        dataset: "eventos_edicoes",
        source_table: "tb_mkt.eventos_edicoes",
        source_identity_digest: digest,
        step_id: "edition-insert",
        canonical_target_id: "canonical-event-1",
        actor_id: "platform-admin-1",
        created_at: new Date("2026-09-29T14:00:00.000Z"),
      },
    ]);

    const result = await service.getReconciliation(organizationId);

    expect(result.datasets.find(({ dataset }) => dataset === "eventos_edicoes")).toMatchObject({
      items: [],
      decisions: [
        {
          sourceTable: "tb_mkt.eventos_edicoes",
          sourceIdentityDigest: digest,
          stepId: "edition-insert",
          canonicalTargetId: "canonical-event-1",
          actorId: "platform-admin-1",
          createdAt: "2026-09-29T14:00:00.000Z",
        },
      ],
    });
  });

  it("rejects non-ambiguous quarantine before querying or recording a destination", async () => {
    prisma.marketingMigrationReconciliationRun.findFirst.mockResolvedValue({
      id: "run-1",
      created_at: new Date("2026-09-29T12:00:00.000Z"),
      datasets: [
        {
          dataset: "eventos_edicoes",
          items: [
            {
              source_table: "tb_mkt.eventos_edicoes",
              source_identity_digest: `sha256:${"a".repeat(64)}`,
              step_id: "edition-insert",
              reason_code: "MKT_EDITION_NAME_INVALID",
            },
          ],
        },
      ],
    });

    await expect(
      service.resolveAssociation({
        organizationId,
        dataset: "eventos_edicoes",
        sourceTable: "tb_mkt.eventos_edicoes",
        sourceIdentityDigest: `sha256:${"a".repeat(64)}`,
        stepId: "edition-insert",
        canonicalTargetId: "canonical-event-1",
        actorId: "platform-admin-1",
        requestId: "request-1",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(prisma.marketingEvent.findFirst).not.toHaveBeenCalled();
    expect(prisma.marketingMigrationReconciliationDecision.create).not.toHaveBeenCalled();
  });

  it("records an explicit event association against an event in the same organization", async () => {
    const digest = `sha256:${"b".repeat(64)}`;
    prisma.marketingMigrationReconciliationRun.findFirst.mockResolvedValue({
      id: "run-2",
      created_at: new Date("2026-09-29T13:00:00.000Z"),
      datasets: [
        {
          dataset: "eventos_edicoes",
          items: [
            {
              source_table: "tb_mkt.eventos_edicoes",
              source_identity_digest: digest,
              step_id: "edition-insert",
              reason_code: "MKT_EDITION_EVENT_AMBIGUOUS",
            },
          ],
        },
      ],
    });
    prisma.marketingMigrationReconciliationDecision.create.mockResolvedValue({
      id: "decision-1",
      created_at: new Date("2026-09-29T14:00:00.000Z"),
    });

    await expect(
      service.resolveAssociation({
        organizationId,
        dataset: "eventos_edicoes",
        sourceTable: "tb_mkt.eventos_edicoes",
        sourceIdentityDigest: digest,
        stepId: "edition-insert",
        canonicalTargetId: "canonical-event-1",
        actorId: "platform-admin-1",
        requestId: "request-2",
      }),
    ).resolves.toMatchObject({
      id: "decision-1",
      createdAt: "2026-09-29T14:00:00.000Z",
    });

    expect(prisma.marketingEvent.findFirst).toHaveBeenCalledWith({
      where: { id: "canonical-event-1", organization_id: organizationId },
      select: { id: true },
    });
    expect(prisma.marketingMigrationReconciliationDecision.create).toHaveBeenCalledWith({
      data: {
        organization_id: organizationId,
        dataset: "eventos_edicoes",
        source_table: "tb_mkt.eventos_edicoes",
        source_identity_digest: digest,
        step_id: "edition-insert",
        canonical_target_id: "canonical-event-1",
        actor_id: "platform-admin-1",
        request_id: "request-2",
      },
      select: { id: true, created_at: true },
    });
  });

  it("rejects a destination outside the selected organization without recording a decision", async () => {
    const digest = `sha256:${"e".repeat(64)}`;
    prisma.marketingMigrationReconciliationRun.findFirst.mockResolvedValue({
      id: "run-3",
      created_at: new Date("2026-09-29T13:30:00.000Z"),
      datasets: [
        {
          dataset: "eventos_edicoes",
          items: [
            {
              source_table: "tb_mkt.eventos_edicoes",
              source_identity_digest: digest,
              step_id: "edition-insert",
              reason_code: "MKT_EDITION_EVENT_AMBIGUOUS",
            },
          ],
        },
      ],
    });
    prisma.marketingEvent.findFirst.mockResolvedValue(null);

    await expect(
      service.resolveAssociation({
        organizationId,
        dataset: "eventos_edicoes",
        sourceTable: "tb_mkt.eventos_edicoes",
        sourceIdentityDigest: digest,
        stepId: "edition-insert",
        canonicalTargetId: "canonical-event-from-other-tenant",
        actorId: "platform-admin-1",
        requestId: "request-cross-tenant",
      }),
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(prisma.marketingEvent.findFirst).toHaveBeenCalledWith({
      where: { id: "canonical-event-from-other-tenant", organization_id: organizationId },
      select: { id: true },
    });
    expect(prisma.marketingMigrationReconciliationDecision.create).not.toHaveBeenCalled();
  });
});
