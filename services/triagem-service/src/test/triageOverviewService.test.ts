import { describe, expect, it, vi } from "vitest";

import {
  deriveTriageOverviewStatus,
  type TriageOverviewPrisma,
  TriageOverviewService,
} from "../services/triageOverviewService.js";

const ORGANIZATION_ID = "a0000000-0000-4000-8000-000000000001";
const USER_ID = "c0000000-0000-4000-8000-000000000001";
const CLIENT_ONE = "b0000000-0000-4000-8000-000000000001";
const CLIENT_TWO = "b0000000-0000-4000-8000-000000000002";
const CLIENT_THREE = "b0000000-0000-4000-8000-000000000003";
const CLIENT_FOUR = "b0000000-0000-4000-8000-000000000004";

function overviewRow(
  items: Array<{
    client_id: string;
    legal_name: string;
    competence: string;
    status: string;
  }>,
  indicators: {
    urgent_open: number;
    routine_pending: number;
    bank_pending: number;
    complete: number;
  },
  total = items.length,
) {
  return {
    items,
    total,
    ...indicators,
  };
}

function createMockPrisma(): TriageOverviewPrisma {
  const prisma = {
    $executeRaw: vi.fn().mockResolvedValue(0),
    $queryRaw: vi.fn(),
    $transaction: vi.fn(async (callback: (transaction: TriageOverviewPrisma) => unknown) =>
      callback(prisma as unknown as TriageOverviewPrisma),
    ),
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

describe("deriveTriageOverviewStatus", () => {
  it.each([
    [
      "prioriza urgência aberta",
      {
        urgentStatuses: ["OPEN"],
        routineChecklists: [{ item: "PENDING" }],
        bankStatuses: ["PENDING"],
      },
      "URGENT_OPEN",
    ],
    [
      "prioriza rotina pendente sobre banco",
      { urgentStatuses: [], routineChecklists: [{ item: "PENDING" }], bankStatuses: ["PENDING"] },
      "ROUTINE_PENDING",
    ],
    [
      "identifica banco pendente",
      { urgentStatuses: [], routineChecklists: [{ item: "COMPLETED" }], bankStatuses: ["PENDING"] },
      "BANK_PENDING",
    ],
    [
      "conclui quando todas as fontes estão concluídas ou não aplicáveis",
      {
        urgentStatuses: ["CLOSED"],
        routineChecklists: [{ first: "COMPLETED", second: "NOT_APPLICABLE" }],
        bankStatuses: ["COMPLETED", "NOT_APPLICABLE"],
      },
      "COMPLETE",
    ],
    [
      "não marca como completa quando nada é aplicável (#1326)",
      {
        urgentStatuses: [],
        routineChecklists: [{ first: "NOT_APPLICABLE" }, {}],
        bankStatuses: ["NOT_APPLICABLE"],
      },
      "NO_APPLICABLE_ITEMS",
    ],
    [
      "competência sem checklist nem extratos não tem itens aplicáveis (#1326)",
      { urgentStatuses: [], routineChecklists: [], bankStatuses: [] },
      "NO_APPLICABLE_ITEMS",
    ],
  ])("%s", (_name, sources, expected) => {
    expect(deriveTriageOverviewStatus(sources)).toBe(expected);
  });
});

describe("TriageOverviewService", () => {
  it("retorna a página produzida pela consulta e agrega indicadores", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      overviewRow(
        [
          {
            client_id: CLIENT_ONE,
            legal_name: "Alfa",
            competence: "2026-09",
            status: "URGENT_OPEN",
          },
          {
            client_id: CLIENT_TWO,
            legal_name: "Beta",
            competence: "2026-09",
            status: "ROUTINE_PENDING",
          },
        ],
        { urgent_open: 1, routine_pending: 1, bank_pending: 1, complete: 1 },
        4,
      ),
    ]);

    const result = await new TriageOverviewService(prisma).list({ page: 1, pageSize: 2 }, viewer());

    expect(result).toEqual({
      items: [
        { client_id: CLIENT_ONE, legal_name: "Alfa", competence: "2026-09", status: "URGENT_OPEN" },
        {
          client_id: CLIENT_TWO,
          legal_name: "Beta",
          competence: "2026-09",
          status: "ROUTINE_PENDING",
        },
      ],
      total: 4,
      page: 1,
      page_size: 2,
      indicators: { urgent_open: 1, routine_pending: 1, bank_pending: 1, complete: 1 },
    });
    expect(prisma.$queryRaw).toHaveBeenCalledOnce();
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(2);
  });

  it("aplica paginação e filtro de status na consulta ao banco", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      overviewRow(
        [
          {
            client_id: CLIENT_THREE,
            legal_name: "Gama",
            competence: "2026-09",
            status: "COMPLETE",
          },
        ],
        { urgent_open: 0, routine_pending: 0, bank_pending: 0, complete: 1 },
        1,
      ),
    ]);

    const result = await new TriageOverviewService(prisma).list(
      { page: 2, pageSize: 1, status: "COMPLETE", clientId: CLIENT_THREE },
      viewer(),
    );

    expect(result).toMatchObject({
      items: [{ client_id: CLIENT_THREE, status: "COMPLETE" }],
      total: 1,
      page: 2,
      page_size: 1,
      indicators: { complete: 1 },
    });
    expect(prisma.$queryRaw).toHaveBeenCalledOnce();
    const queryArguments = vi.mocked(prisma.$queryRaw).mock.calls[0] as unknown[];
    expect(queryArguments.at(-2)).toBe(1);
    expect(queryArguments.at(-1)).toBe(1);
  });

  it("reabre a linha quando uma nova pendência bancária aparece", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([
        overviewRow(
          [
            {
              client_id: CLIENT_FOUR,
              legal_name: "Delta",
              competence: "2026-09",
              status: "COMPLETE",
            },
          ],
          { urgent_open: 0, routine_pending: 0, bank_pending: 0, complete: 1 },
        ),
      ])
      .mockResolvedValueOnce([
        overviewRow(
          [
            {
              client_id: CLIENT_FOUR,
              legal_name: "Delta",
              competence: "2026-09",
              status: "BANK_PENDING",
            },
          ],
          { urgent_open: 0, routine_pending: 0, bank_pending: 1, complete: 0 },
        ),
      ]);

    const service = new TriageOverviewService(prisma);
    await expect(service.list({ page: 1, pageSize: 20 }, viewer())).resolves.toMatchObject({
      items: [expect.objectContaining({ status: "COMPLETE" })],
    });
    await expect(service.list({ page: 1, pageSize: 20 }, viewer())).resolves.toMatchObject({
      items: [expect.objectContaining({ status: "BANK_PENDING" })],
    });
  });
});
