import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    user: {
      findFirst: vi.fn(),
    },
    timeBankReleases: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findFirstOrThrow: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    pointsConfig: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("../integrations/prisma.js", () => ({ prismaClient: prismaMock }));

import { TimeBankReleaseService } from "../services/timeBankReleaseService.js";

describe("TimeBankReleaseService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(
      async (fn: (tx: typeof prismaMock) => Promise<unknown>) => fn(prismaMock),
    );
  });

  it("create lanca 404 quando colaborador nao existe", async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);
    const service = new TimeBankReleaseService();
    await expect(
      service.create({
        organization_id: "org-1",
        target_user_id: "user-1",
        date: new Date(),
        minutes: 30,
        reason: "Extra",
        added_by_user_id: "manager-1",
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("approve lanca 404 quando lancamento nao existe", async () => {
    prismaMock.timeBankReleases.findFirst.mockResolvedValue(null);
    const service = new TimeBankReleaseService();
    await expect(service.approve({ id: "rel-1", organization_id: "org-1" })).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("getSummary retorna saldo e contagens por colaborador", async () => {
    prismaMock.pointsConfig.findUnique.mockResolvedValue({
      user_id: "user-1",
      organization_id: "org-1",
      bank_balance: 75,
    });
    prismaMock.timeBankReleases.count.mockResolvedValueOnce(2).mockResolvedValueOnce(1);

    const service = new TimeBankReleaseService();
    await expect(service.getSummary("org-1", "user-1")).resolves.toEqual({
      user_id: "user-1",
      balance_minutes: 75,
      approved_releases_count: 2,
      pending_releases_count: 1,
    });
  });

  it("getOverview retorna totais agregados da organizacao", async () => {
    prismaMock.timeBankReleases.count.mockResolvedValueOnce(3).mockResolvedValueOnce(5);
    prismaMock.pointsConfig.findMany.mockResolvedValue([
      { user_id: "user-1", bank_balance: 10 },
      { user_id: "user-2", bank_balance: -15 },
      { user_id: "user-3", bank_balance: 0 },
    ]);

    const service = new TimeBankReleaseService();
    await expect(service.getOverview("org-1")).resolves.toEqual({
      total_pending_releases: 3,
      total_approved_releases: 5,
      users_with_positive_balance: 1,
      users_with_negative_balance: 1,
    });
  });
});
