import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    scoreQuestion: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("../integrations/prisma.js", () => ({ prismaClient: prismaMock }));

import { ScoreQuestionService } from "../services/scoreQuestionService.js";

describe("ScoreQuestionService", () => {
  beforeEach(() => vi.clearAllMocks());

  it("update lança 404 quando pergunta não existe", async () => {
    prismaMock.scoreQuestion.findFirst.mockResolvedValue(null);
    const service = new ScoreQuestionService();
    await expect(service.update({ id: "q-1", organization_id: "org-1", question: "Nova" })).rejects.toMatchObject({ statusCode: 404 });
  });

  it("list aplica filtro por organização", async () => {
    prismaMock.scoreQuestion.findMany.mockResolvedValue([{ id: "q-1" }]);
    const service = new ScoreQuestionService();
    const result = await service.list("org-1");
    expect(result).toEqual([{ id: "q-1" }]);
  });
});
