import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    scoreQuarter: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    scoreQuestion: {
      findMany: vi.fn(),
    },
    scoreEvaluation: {
      create: vi.fn(),
    },
    scoreNitro: {},
    $transaction: vi.fn(),
  },
}));

vi.mock("../integrations/prisma.js", () => ({ prismaClient: prismaMock }));

import { ScoreQuarterService } from "../services/scoreQuarterService.js";

describe("ScoreQuarterService", () => {
  beforeEach(() => vi.clearAllMocks());

  it("generateQuarterlyScore lanca 409 quando trimestre ja existe", async () => {
    prismaMock.scoreQuarter.findUnique.mockResolvedValue({ id: "score-1" });
    const service = new ScoreQuarterService();
    await expect(
      service.generateQuarterlyScore({
        organization_id: "org-1",
        target_user_id: "user-1",
        quarter: "2026-Q1",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("getDetail lanca 404 quando score nao existe", async () => {
    prismaMock.scoreQuarter.findUnique.mockResolvedValue(null);
    const service = new ScoreQuarterService();
    await expect(
      service.getDetail({ organization_id: "org-1", score_id: "score-1" }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("getDetail inclui usuario dono do score com id e nome", async () => {
    prismaMock.scoreQuarter.findUnique.mockResolvedValue({
      id: "score-1",
      user_id: "user-1",
      organization_id: "org-1",
      user: { id: "user-1", name: "Ana Silva" },
      nitro: null,
      evaluations: [],
    });

    const service = new ScoreQuarterService();
    await expect(
      service.getDetail({ organization_id: "org-1", score_id: "score-1" }),
    ).resolves.toMatchObject({
      id: "score-1",
      user: { id: "user-1", name: "Ana Silva" },
    });
    expect(prismaMock.scoreQuarter.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          user: { select: { id: true, name: true } },
        }),
      }),
    );
  });
});
