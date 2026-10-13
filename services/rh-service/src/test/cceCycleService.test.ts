import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    cceFloorConfiguration: { upsert: vi.fn(), findUnique: vi.fn() },
    cceCycle: { findUnique: vi.fn(), create: vi.fn(), findMany: vi.fn() },
    cceWeeklyEvaluation: {
      createMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    user: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("../integrations/prisma.js", () => ({ prismaClient: prismaMock }));

import { CceCycleService } from "../services/cceCycleService.js";

describe("CceCycleService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation((operation) => operation(prismaMock));
    prismaMock.user.findFirst.mockResolvedValue({ id: "manager-1" });
  });

  it("configura até quatro andares e limita a geração legada aos andares 0–3", async () => {
    prismaMock.cceFloorConfiguration.upsert.mockResolvedValue({
      organization_id: "org-1",
      floor_count: 4,
    });
    prismaMock.cceCycle.findUnique.mockResolvedValue(null);
    prismaMock.cceFloorConfiguration.findUnique.mockResolvedValue({ floor_count: 4 });
    prismaMock.cceCycle.create.mockResolvedValue({
      id: "cycle-1",
      organization_id: "org-1",
      year: 2026,
      month: 10,
    });

    const service = new CceCycleService();
    await service.configureFloors({ organization_id: "org-1", floor_count: 4 });
    await service.createCycle({
      organization_id: "org-1",
      created_by_user_id: "manager-1",
      year: 2026,
      month: 10,
    });

    expect(prismaMock.cceWeeklyEvaluation.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ floor: 0, week: 1 }),
        expect.objectContaining({ floor: 3, week: 4 }),
      ]),
    });
    const generated = prismaMock.cceWeeklyEvaluation.createMany.mock.calls[0][0].data;
    expect(generated).toHaveLength(16);
    expect(generated.every((evaluation: { floor: number }) => evaluation.floor <= 3)).toBe(true);
  });

  it("rejeita um segundo ciclo para a mesma organização e competência", async () => {
    prismaMock.cceCycle.findUnique.mockResolvedValue({ id: "cycle-1" });

    await expect(
      new CceCycleService().createCycle({
        organization_id: "org-1",
        created_by_user_id: "manager-1",
        year: 2026,
        month: 10,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(prismaMock.cceWeeklyEvaluation.createMany).not.toHaveBeenCalled();
  });

  it("calcula o total semanal de 0 a 9 pelos pesos legados", async () => {
    prismaMock.cceWeeklyEvaluation.findFirst.mockResolvedValue({
      id: "week-1",
      organization_id: "org-1",
      cycle_id: "cycle-1",
      floor: 0,
      week: 1,
    });
    prismaMock.user.findFirst.mockResolvedValue({ id: "monitor-1" });
    prismaMock.cceWeeklyEvaluation.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.cceWeeklyEvaluation.findFirst.mockReset();
    prismaMock.cceWeeklyEvaluation.findFirst
      .mockResolvedValueOnce({
        id: "week-1",
        completed_at: null,
      })
      .mockResolvedValueOnce({
        id: "week-1",
        organization: true,
        cleanliness: true,
        delays: true,
        cellphone: true,
        conversations: true,
        demands: true,
        dress_code: true,
        completed_at: new Date("2026-10-07"),
      });

    const result = await new CceCycleService().updateWeeklyEvaluation({
      organization_id: "org-1",
      evaluation_id: "week-1",
      monitor_user_id: "monitor-1",
      evaluated_at: "2026-10-07",
      occurrences: {
        organization: true,
        cleanliness: true,
        delays: true,
        cellphone: true,
        conversations: true,
        demands: true,
        dress_code: true,
      },
    });

    expect(result.total).toBe(9);
    expect(prismaMock.cceWeeklyEvaluation.findFirst).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ where: { id: "week-1", cycle: { organization_id: "org-1" } } }),
    );
  });

  it("impede atualização de avaliação pertencente a outra organização", async () => {
    prismaMock.cceWeeklyEvaluation.findFirst.mockResolvedValue(null);

    await expect(
      new CceCycleService().updateWeeklyEvaluation({
        organization_id: "org-1",
        evaluation_id: "week-other-org",
        monitor_user_id: "monitor-1",
        evaluated_at: "2026-10-07",
        occurrences: {
          organization: false,
          cleanliness: false,
          delays: false,
          cellphone: false,
          conversations: false,
          demands: false,
          dress_code: false,
        },
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(prismaMock.cceWeeklyEvaluation.updateMany).not.toHaveBeenCalled();
  });
});
