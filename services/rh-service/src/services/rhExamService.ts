import { error as logError, ServiceError } from "@workspace/shared";

import { Prisma, type PrismaClient } from "../generated/prisma/client.js";
import { prismaClient } from "../integrations/prisma.js";

export interface CreateRhExamInput {
  organization_id: string;
  created_by_id: string;
  title: string;
  evaluator_id: string;
  window_start?: string;
  window_end?: string;
  observations: string;
  participant_ids: string[];
  questions: Array<{ prompt: string; value: number; answer_key: string }>;
}

export class RhExamService {
  constructor(private readonly db: PrismaClient = prismaClient) {}

  async list(organizationId: string): Promise<unknown> {
    try {
      if (!organizationId) throw new ServiceError(400, "organization_id é obrigatório.");
      return await this.db.rhExam.findMany({
        where: { organization_id: organizationId },
        include: {
          evaluator: { select: { id: true, name: true } },
          _count: { select: { participants: true, questions: true } },
        },
        orderBy: { created_at: "desc" },
      });
    } catch (err: unknown) {
      logError("Erro ao listar provas discursivas", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro interno ao listar provas discursivas.", err);
    }
  }

  async get(organizationId: string, id: string): Promise<unknown> {
    try {
      const exam = await this.db.rhExam.findFirst({
        where: { id, organization_id: organizationId },
        include: {
          evaluator: { select: { id: true, name: true } },
          participants: { include: { user: { select: { id: true, name: true } } } },
          questions: { orderBy: { position: "asc" } },
        },
      });
      if (!exam) throw new ServiceError(404, "Prova não encontrada.");
      return exam;
    } catch (err: unknown) {
      logError("Erro ao consultar prova discursiva", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro interno ao consultar prova discursiva.", err);
    }
  }

  async create(input: CreateRhExamInput): Promise<unknown> {
    try {
      if (!input.organization_id || !input.created_by_id) {
        throw new ServiceError(400, "Organização e usuário responsável são obrigatórios.");
      }
      if (input.questions.length === 0 || input.participant_ids.length === 0) {
        throw new ServiceError(400, "A prova exige ao menos uma questão e um participante.");
      }

      const userIds = [
        ...new Set([input.created_by_id, input.evaluator_id, ...input.participant_ids]),
      ];
      const users = await this.db.user.findMany({
        where: { id: { in: userIds }, organization_id: input.organization_id },
        select: { id: true },
      });
      if (users.length !== userIds.length) {
        throw new ServiceError(400, "Avaliador e participantes devem pertencer à organização.");
      }

      return await this.db.rhExam.create({
        data: {
          organization_id: input.organization_id,
          created_by_id: input.created_by_id,
          title: input.title.trim(),
          evaluator_id: input.evaluator_id,
          window_start: input.window_start ? new Date(input.window_start) : null,
          window_end: input.window_end ? new Date(input.window_end) : null,
          observations: input.observations,
          participants: {
            create: input.participant_ids.map((user_id) => ({
              user_id,
              organization_id: input.organization_id,
            })),
          },
          questions: {
            create: input.questions.map((question, position) => ({
              ...question,
              prompt: question.prompt.trim(),
              answer_key: question.answer_key.trim(),
              position,
              organization_id: input.organization_id,
            })),
          },
        },
        include: { participants: true, questions: { orderBy: { position: "asc" } } },
      });
    } catch (err: unknown) {
      logError("Erro ao criar prova discursiva", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro interno ao criar prova discursiva.", err);
    }
  }

  async open(organizationId: string, id: string): Promise<unknown> {
    try {
      const exam = await this.db.rhExam.findFirst({
        where: { id, organization_id: organizationId },
        include: { participants: true, questions: true },
      });
      if (!exam) throw new ServiceError(404, "Prova não encontrada.");
      if (exam.status !== "New") {
        throw new ServiceError(409, "Somente provas novas podem ser abertas.");
      }
      if (exam.participants.length === 0 || exam.questions.length === 0) {
        throw new ServiceError(
          409,
          "A prova precisa ter participantes e questões para ser aberta.",
        );
      }

      return await this.db.$transaction(async (tx) => {
        const transition = await tx.rhExam.updateMany({
          where: { id, organization_id: organizationId, status: "New" },
          data: { status: "Open" },
        });
        if (transition.count !== 1) {
          throw new ServiceError(409, "Somente provas novas podem ser abertas.");
        }

        await tx.rhExamAnswer.createMany({
          data: exam.participants.flatMap((participant) =>
            exam.questions.map((question) => ({
              exam_participant_id: participant.id,
              question_id: question.id,
              organization_id: organizationId,
            })),
          ),
          skipDuplicates: true,
        });
        return { ...exam, status: "Open" };
      });
    } catch (err: unknown) {
      logError("Erro ao abrir prova discursiva", { err });
      if (err instanceof ServiceError) throw err;
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ServiceError(409, "A prova já foi aberta.", err);
      }
      throw new ServiceError(500, "Erro interno ao abrir prova discursiva.", err);
    }
  }
}
