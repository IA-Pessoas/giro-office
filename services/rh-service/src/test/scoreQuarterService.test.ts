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

  it("generateQuarterlyScore lança 409 quando trimestre já existe", async () => {
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

  it("getDetail lança 404 quando score não existe", async () => {
    prismaMock.scoreQuarter.findUnique.mockResolvedValue(null);
    const service = new ScoreQuarterService();
    await expect(
      service.getDetail({ organization_id: "org-1", score_id: "score-1" }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
