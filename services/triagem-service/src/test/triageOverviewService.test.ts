import { describe, expect, it, vi } from "vitest";

import {
  type TriageOverviewPrisma,
  TriageOverviewService,
} from "../services/triageOverviewService.js";

const ORGANIZATION_ID = "a0000000-0000-4000-8000-000000000001";
const USER_ID = "c0000000-0000-4000-8000-000000000001";
const CLIENT_ONE = "b0000000-0000-4000-8000-000000000001";
const CLIENT_TWO = "b0000000-0000-4000-8000-000000000002";
const CLIENT_THREE = "b0000000-0000-4000-8000-000000000003";
const CLIENT_FOUR = "b0000000-0000-4000-8000-000000000004";

const competence = (clientId: string, value: string, name: string) => ({
  id: `d${clientId.slice(1)}`,
  client_id: clientId,
  competence: value,
  client: { name, company_name: null },
});

function createMockPrisma(): TriageOverviewPrisma {
  const prisma = {
    $executeRaw: vi.fn().mockResolvedValue(0),
    $transaction: vi.fn(async (callback: (transaction: TriageOverviewPrisma) => unknown) =>
      callback(prisma as unknown as TriageOverviewPrisma),
    ),
    triageCompetence: { findMany: vi.fn() },
    triageMonthly: { findMany: vi.fn() },
    triageBankStatement: { findMany: vi.fn() },
    triageUrgentRequest: { findMany: vi.fn() },
  };

  return prisma as unknown as TriageOverviewPrisma;
}

function viewer() {
  return {
    userId: USER_ID,
    organizationId: ORGANIZATION_ID,
    permission: 1,
    modules: { triagem: 1 },
  };
}

describe("TriageOverviewService", () => {
  it("deriva a precedência e agrega indicadores antes da paginação", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.triageCompetence.findMany).mockResolvedValue([
      competence(CLIENT_ONE, "2026-09", "Alfa"),
      competence(CLIENT_TWO, "2026-09", "Beta"),
      competence(CLIENT_THREE, "2026-09", "Gama"),
      competence(CLIENT_FOUR, "2026-09", "Delta"),
    ] as never);
    vi.mocked(prisma.triageMonthly.findMany).mockResolvedValue([
      {
        client_id: CLIENT_ONE,
        competence: "2026-09",
        type: "CONTABIL",
        checklist: { item: "PENDING" },
      },
      {
        client_id: CLIENT_TWO,
        competence: "2026-09",
        type: "CONTABIL",
        checklist: { item: "PENDING" },
      },
    ] as never);
    vi.mocked(prisma.triageBankStatement.findMany).mockResolvedValue([
      { client_id: CLIENT_ONE, competence: "2026-09", status: "COMPLETED" },
      { client_id: CLIENT_TWO, competence: "2026-09", status: "PENDING" },
      { client_id: CLIENT_THREE, competence: "2026-09", status: "PENDING" },
    ] as never);
    vi.mocked(prisma.triageUrgentRequest.findMany).mockResolvedValue([
      { client_id: CLIENT_ONE, competence: "2026-09", status: "OPEN" },
    ] as never);

    const result = await new TriageOverviewService(prisma).list({ page: 1, pageSize: 2 }, viewer());

    expect(result).toEqual({
      items: [
        expect.objectContaining({ client_id: CLIENT_ONE, status: "URGENT_OPEN" }),
        expect.objectContaining({ client_id: CLIENT_TWO, status: "ROUTINE_PENDING" }),
      ],
      total: 4,
      page: 1,
      page_size: 2,
      indicators: { urgent_open: 1, routine_pending: 1, bank_pending: 1, complete: 1 },
    });
    expect(prisma.triageCompetence.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organization_id: ORGANIZATION_ID, archived_at: null },
      }),
    );
  });

  it("aplica paginação e filtro de status no servidor", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.triageCompetence.findMany).mockResolvedValue([
      competence(CLIENT_THREE, "2026-09", "Gama"),
    ] as never);
    vi.mocked(prisma.triageMonthly.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.triageBankStatement.findMany).mockResolvedValue([
      { client_id: CLIENT_ONE, competence: "2026-09", status: "PENDING" },
    ] as never);
    vi.mocked(prisma.triageUrgentRequest.findMany).mockResolvedValue([] as never);

    const result = await new TriageOverviewService(prisma).list(
      { page: 2, pageSize: 1, status: "COMPLETE", clientId: CLIENT_THREE },
      viewer(),
    );

    expect(result).toMatchObject({
      items: [],
      total: 1,
      page: 2,
      page_size: 1,
      indicators: { complete: 1 },
    });
    expect(prisma.triageCompetence.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organization_id: ORGANIZATION_ID,
          client_id: CLIENT_THREE,
          archived_at: null,
        },
      }),
    );
  });

  it("reabre a linha quando uma nova pendência bancária aparece", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.triageCompetence.findMany).mockResolvedValue([
      competence(CLIENT_FOUR, "2026-09", "Delta"),
    ] as never);
    vi.mocked(prisma.triageMonthly.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.triageUrgentRequest.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.triageBankStatement.findMany)
      .mockResolvedValueOnce([
        { client_id: CLIENT_FOUR, competence: "2026-09", status: "COMPLETED" },
      ] as never)
      .mockResolvedValueOnce([
        { client_id: CLIENT_FOUR, competence: "2026-09", status: "PENDING" },
      ] as never);

    const service = new TriageOverviewService(prisma);
    await expect(service.list({ page: 1, pageSize: 20 }, viewer())).resolves.toMatchObject({
      items: [expect.objectContaining({ status: "COMPLETE" })],
    });
    await expect(service.list({ page: 1, pageSize: 20 }, viewer())).resolves.toMatchObject({
      items: [expect.objectContaining({ status: "BANK_PENDING" })],
    });
  });
});
