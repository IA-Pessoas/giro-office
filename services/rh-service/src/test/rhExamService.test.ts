import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    user: { findMany: vi.fn() },
    rhExam: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    rhExamAnswer: { createMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("../integrations/prisma.js", () => ({ prismaClient: prismaMock }));

import { RhExamService } from "../services/rhExamService.js";

const input = {
  organization_id: "org-1",
  created_by_id: "admin-1",
  title: "Prova discursiva",
  evaluator_id: "evaluator-1",
  observations: "",
  participant_ids: ["participant-1", "participant-2"],
  questions: [
    { prompt: "Questão 1", value: 5, answer_key: "Critérios" },
    { prompt: "Questão 2", value: 10, answer_key: "Resposta esperada" },
  ],
};

describe("RhExamService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation((callback) => callback(prismaMock));
    prismaMock.user.findMany.mockResolvedValue([
      { id: "admin-1" },
      { id: "evaluator-1" },
      { id: "participant-1" },
      { id: "participant-2" },
    ]);
  });

  it("cria a prova com participantes e questões na mesma organização", async () => {
    prismaMock.rhExam.create.mockResolvedValue({ id: "exam-1", status: "New" });

    const result = await new RhExamService().create(input);

    expect(result).toEqual({ id: "exam-1", status: "New" });
    expect(prismaMock.user.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: expect.arrayContaining(["evaluator-1", "participant-1"]) },
        organization_id: "org-1",
      },
      select: { id: true },
    });
    expect(prismaMock.rhExam.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          participants: {
            create: expect.arrayContaining([expect.objectContaining({ user_id: "participant-1" })]),
          },
          questions: {
            create: expect.arrayContaining([expect.objectContaining({ position: 0, value: 5 })]),
          },
        }),
      }),
    );
  });

  it("recusa participantes ou avaliador fora da organização", async () => {
    prismaMock.user.findMany.mockResolvedValue([{ id: "admin-1" }, { id: "evaluator-1" }]);

    await expect(new RhExamService().create(input)).rejects.toMatchObject({ statusCode: 400 });
    expect(prismaMock.rhExam.create).not.toHaveBeenCalled();
  });

  it("abre a prova e prepara uma resposta vazia para cada questão e participante", async () => {
    prismaMock.rhExam.findFirst.mockResolvedValue({
      id: "exam-1",
      status: "New",
      participants: [{ id: "p-1" }, { id: "p-2" }],
      questions: [{ id: "q-1" }, { id: "q-2" }],
    });
    prismaMock.rhExamAnswer.createMany.mockResolvedValue({ count: 4 });
    prismaMock.rhExam.updateMany.mockResolvedValue({ count: 1 });

    const result = await new RhExamService().open("org-1", "exam-1");

    expect(result).toEqual(
      expect.objectContaining({ id: "exam-1", status: "Open", participants: expect.any(Array) }),
    );
    expect(prismaMock.rhExamAnswer.createMany).toHaveBeenCalledWith({
      data: [
        { exam_participant_id: "p-1", question_id: "q-1", organization_id: "org-1" },
        { exam_participant_id: "p-1", question_id: "q-2", organization_id: "org-1" },
        { exam_participant_id: "p-2", question_id: "q-1", organization_id: "org-1" },
        { exam_participant_id: "p-2", question_id: "q-2", organization_id: "org-1" },
      ],
      skipDuplicates: true,
    });
    expect(prismaMock.rhExam.updateMany).toHaveBeenCalledWith({
      where: { id: "exam-1", organization_id: "org-1", status: "New" },
      data: { status: "Open" },
    });
  });

  it("não reabre prova em estado diferente de Nova nem vaza prova de outra organização", async () => {
    prismaMock.rhExam.findFirst.mockResolvedValue(null);
    await expect(new RhExamService().open("org-1", "exam-2")).rejects.toMatchObject({
      statusCode: 404,
    });

    prismaMock.rhExam.findFirst.mockResolvedValue({
      id: "exam-1",
      status: "Open",
      participants: [{ id: "p-1" }],
      questions: [{ id: "q-1" }],
    });
    await expect(new RhExamService().open("org-1", "exam-1")).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(prismaMock.rhExamAnswer.createMany).not.toHaveBeenCalled();
  });

  it("rejeita a segunda abertura concorrente na transição condicional", async () => {
    prismaMock.rhExam.findFirst.mockResolvedValue({
      id: "exam-1",
      status: "New",
      participants: [{ id: "p-1" }],
      questions: [{ id: "q-1" }],
    });
    prismaMock.rhExam.updateMany.mockResolvedValue({ count: 0 });

    await expect(new RhExamService().open("org-1", "exam-1")).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(prismaMock.rhExamAnswer.createMany).not.toHaveBeenCalled();
  });
});
