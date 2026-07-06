import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    user: {
      findUnique: vi.fn(),
    },
    scoreEvaluation: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    scoreQuarter: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    scoreNitro: {},
  },
}));

vi.mock("../integrations/prisma.js", () => ({ prismaClient: prismaMock }));

import { ScoreEvaluationService } from "../services/scoreEvaluationService.js";

describe("ScoreEvaluationService", () => {
  beforeEach(() => vi.clearAllMocks());

  it("listPendingEvaluations lanca 404 quando usuario nao existe", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    const service = new ScoreEvaluationService();
    await expect(service.listPendingEvaluations("org-1", "user-1")).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("submitEvaluation lanca 404 quando avaliacao nao existe", async () => {
    prismaMock.scoreEvaluation.findFirst.mockResolvedValue(null);
    const service = new ScoreEvaluationService();
    await expect(
      service.submitEvaluation({
        organization_id: "org-1",
        user_id: "user-1",
        evaluation_id: "550e8400-e29b-41d4-a716-446655440001",
        answers: [{ question_id: "q-1", answer: 5 }],
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("submitEvaluation preserva question_text salvo na avaliacao pendente", async () => {
    prismaMock.scoreEvaluation.findFirst.mockResolvedValue({
      id: "550e8400-e29b-41d4-a716-446655440001",
      score_id: "score-1",
      organization_id: "org-1",
      evaluator_id: "user-1",
      evaluator_role: "SELF",
      status: "Pending",
      answers: [
        {
          question_id: "q-1",
          question_text: "Entrega no prazo?",
          answer: 0,
          obs: "",
        },
      ],
      scoreQuarter: { id: "score-1", organization_id: "org-1" },
    });
    prismaMock.scoreEvaluation.update.mockResolvedValue({});
    prismaMock.scoreQuarter.findFirst.mockResolvedValue(null);

    const service = new ScoreEvaluationService();
    await service.submitEvaluation({
      organization_id: "org-1",
      user_id: "user-1",
      evaluation_id: "550e8400-e29b-41d4-a716-446655440001",
      answers: [{ question_id: "q-1", answer: 5, obs: "ok" }],
    });

    expect(prismaMock.scoreEvaluation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          answers: [
            {
              question_id: "q-1",
              question_text: "Entrega no prazo?",
              answer: 5,
              obs: "ok",
            },
          ],
        }),
      }),
    );
  });
});
