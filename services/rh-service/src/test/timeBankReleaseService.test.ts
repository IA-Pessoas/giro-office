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
    },
    pointsConfig: {
      findUnique: vi.fn(),
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

  it("create lança 404 quando colaborador não existe", async () => {
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

  it("approve lança 404 quando lançamento não existe", async () => {
    prismaMock.timeBankReleases.findFirst.mockResolvedValue(null);
    const service = new TimeBankReleaseService();
    await expect(service.approve({ id: "rel-1", organization_id: "org-1" })).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});
