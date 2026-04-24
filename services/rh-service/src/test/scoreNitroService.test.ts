import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    scoreNitro: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    scoreQuarter: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("../integrations/prisma.js", () => ({ prismaClient: prismaMock }));

import { ScoreNitroService } from "../services/scoreNitroService.js";

describe("ScoreNitroService", () => {
  beforeEach(() => vi.clearAllMocks());

  it("updateMetric lança 404 quando registro nitro não existe", async () => {
    prismaMock.scoreNitro.findUnique.mockResolvedValue(null);
    const service = new ScoreNitroService();
    await expect(
      service.updateMetric("org-1", "user-1", {
        score_id: "550e8400-e29b-41d4-a716-446655440099",
        type: "projects",
        value: 1,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("updateMetric lança 400 quando organization_id é vazio", async () => {
    const service = new ScoreNitroService();
    await expect(
      service.updateMetric("", "user-1", {
        score_id: "550e8400-e29b-41d4-a716-446655440099",
        type: "projects",
        value: 1,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
