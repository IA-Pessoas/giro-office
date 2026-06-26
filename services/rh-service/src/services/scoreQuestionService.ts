import { randomUUID } from "node:crypto";

import { assertNonEmptyString, error as logError, ServiceError } from "@workspace/shared";

import type { Prisma, PrismaClient } from "../generated/prisma/client.js";
import { prismaClient } from "../integrations/prisma.js";

const SCORE_QUESTION_SELECT = {
  id: true,
  question: true,
  type: true,
  active: true,
  question_id: true,
  organization_id: true,
} as const;

export type ScoreQuestionSnapshot = Prisma.ScoreQuestionGetPayload<{
  select: typeof SCORE_QUESTION_SELECT;
}>;

export interface ScoreQuestionCreateInput {
  organization_id: string;
  question: string;
  type: ScoreQuestionSnapshot["type"];
  active?: boolean;
}

export interface ScoreQuestionUpdateInput {
  id: string;
  organization_id: string;
  question?: string;
  type?: ScoreQuestionSnapshot["type"];
  active?: boolean;
}

export interface ScoreQuestionDeleteInput {
  id: string;
  organization_id: string;
}

export interface ScoreQuestionListOptions {
  type?: ScoreQuestionSnapshot["type"];
  includeInactive?: boolean;
}

class ScoreQuestionService {
  constructor(private readonly prisma: PrismaClient = prismaClient) {}

  async create(input: ScoreQuestionCreateInput): Promise<ScoreQuestionSnapshot> {
    try {
      const organizationId = assertNonEmptyString(input.organization_id, "organization_id");
      const question = assertNonEmptyString(input.question, "question");
      const active = input.active ?? true;
      const id = randomUUID();

      const created = await this.prisma.scoreQuestion.create({
        data: {
          id,
          question_id: id,
          organization_id: organizationId,
          question,
          type: input.type,
          active,
        },
        select: SCORE_QUESTION_SELECT,
      });

      return created;
    } catch (err: unknown) {
      logError("Erro ao criar pergunta de score", { err });
      if (err instanceof ServiceError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new ServiceError(500, `Erro interno ao criar pergunta de score. ${msg}`, err);
    }
  }

  async update(input: ScoreQuestionUpdateInput): Promise<ScoreQuestionSnapshot> {
    try {
      const id = assertNonEmptyString(input.id, "id");
      const organizationId = assertNonEmptyString(input.organization_id, "organization_id");

      if (input.question === undefined && input.type === undefined && input.active === undefined) {
        throw new ServiceError(400, "Informe question, type ou active para atualizar.");
      }

      const existing = await this.prisma.scoreQuestion.findFirst({
        where: { id, organization_id: organizationId },
        select: SCORE_QUESTION_SELECT,
      });

      if (!existing) {
        throw new ServiceError(404, "Pergunta não encontrada.");
      }

      const data: {
        question?: string;
        type?: ScoreQuestionSnapshot["type"];
        active?: boolean;
      } = {};

      if (input.question !== undefined) {
        data.question = input.question;
      }
      if (input.type !== undefined) {
        data.type = input.type;
      }
      if (input.active !== undefined) {
        data.active = input.active;
      }

      const updated = await this.prisma.scoreQuestion.update({
        where: { id },
        data,
        select: SCORE_QUESTION_SELECT,
      });

      return updated;
    } catch (err: unknown) {
      logError("Erro ao atualizar pergunta de score", { err });
      if (err instanceof ServiceError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new ServiceError(500, `Erro interno ao atualizar pergunta de score. ${msg}`, err);
    }
  }

  async list(
    organizationId: string,
    options: ScoreQuestionListOptions = {},
  ): Promise<ScoreQuestionSnapshot[]> {
    try {
      const orgId = assertNonEmptyString(organizationId, "organization_id");

      const where: Prisma.ScoreQuestionWhereInput = {
        organization_id: orgId,
      };
      if (options.type !== undefined) {
        where.type = options.type;
      }
      if (options.includeInactive !== true) {
        where.active = true;
      }

      return await this.prisma.scoreQuestion.findMany({
        where,
        orderBy: { type: "asc" },
        select: SCORE_QUESTION_SELECT,
      });
    } catch (err: unknown) {
      logError("Erro ao listar perguntas de score", { err });
      if (err instanceof ServiceError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new ServiceError(500, `Erro interno ao listar perguntas de score. ${msg}`, err);
    }
  }

  async delete(input: ScoreQuestionDeleteInput): Promise<{ message: string }> {
    try {
      const id = assertNonEmptyString(input.id, "id");
      const organizationId = assertNonEmptyString(input.organization_id, "organization_id");

      const existing = await this.prisma.scoreQuestion.findFirst({
        where: { id, organization_id: organizationId },
        select: { id: true },
      });

      if (!existing) {
        throw new ServiceError(404, "Pergunta não encontrada.");
      }

      await this.prisma.scoreQuestion.update({
        where: { id },
        data: { active: false },
      });

      return { message: "Pergunta inativada com sucesso" };
    } catch (err: unknown) {
      logError("Erro ao inativar pergunta de score", { err });
      if (err instanceof ServiceError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new ServiceError(500, `Erro interno ao inativar pergunta de score. ${msg}`, err);
    }
  }
}

export { ScoreQuestionService };
