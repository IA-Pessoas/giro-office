import { assertNonEmptyString, error as logError, ServiceError } from "@workspace/shared";

import {
  Prisma,
  type PrismaClient,
  ScoreEvaluationStatus,
  ScoreEvaluatorRole,
  ScoreQuestionType,
} from "../generated/prisma/client.js";
import { prismaClient } from "../integrations/prisma.js";
import { ScoreEvaluationService } from "./scoreEvaluationService.js";

const PERMISSION_LEADER = 1;
const PERMISSION_COLLABORATOR = 0;

type OrgPermission = { rh: number | null };

function pickOrgPermission(
  user: {
    permissionRef: { organization_id: string; rh: number | null } | null;
    permissions: { organization_id: string; rh: number | null }[];
  },
  organizationId: string,
): OrgPermission | null {
  if (user.permissionRef?.organization_id === organizationId) {
    return { rh: user.permissionRef.rh ?? null };
  }
  const row = user.permissions.find((p) => p.organization_id === organizationId);
  return row ? { rh: row.rh ?? null } : null;
}

export interface GenerateQuarterlyScoreInput {
  organization_id: string;
  target_user_id: string;
  quarter: string;
}

export interface UpdateNitroInput {
  organization_id: string;
  score_id: string;
  type: "projects" | "hours" | "errors" | "folders";
  value: number;
}

export interface GetScoreDetailInput {
  organization_id: string;
  score_id: string;
}

class ScoreQuarterService {
  private readonly scoreEvaluation: ScoreEvaluationService;

  constructor(private readonly db: PrismaClient = prismaClient) {
    this.scoreEvaluation = new ScoreEvaluationService(db);
  }

  private async findDepartmentLeader(
    tx: Prisma.TransactionClient,
    organizationId: string,
    departmentId: string,
    excludeId: string,
  ) {
    if (!departmentId) {
      return null;
    }

    return tx.user.findFirst({
      where: {
        id: { not: excludeId },
        department_id: departmentId,
        organization_id: organizationId,
        permissions: {
          some: {
            organization_id: organizationId,
            rh: PERMISSION_LEADER,
          },
        },
      },
    });
  }

  private async findSubordinates(
    tx: Prisma.TransactionClient,
    organizationId: string,
    departmentId: string,
    leaderId: string,
  ) {
    if (!departmentId) {
      return [];
    }

    return tx.user.findMany({
      where: {
        id: { not: leaderId },
        department_id: departmentId,
        organization_id: organizationId,
        permissions: {
          some: {
            organization_id: organizationId,
            rh: PERMISSION_COLLABORATOR,
          },
        },
      },
    });
  }

  async generateQuarterlyScore(input: GenerateQuarterlyScoreInput): Promise<unknown> {
    try {
      const organizationId = assertNonEmptyString(input.organization_id, "organization_id");
      const targetUserId = assertNonEmptyString(input.target_user_id, "target_user_id");
      const quarter = assertNonEmptyString(input.quarter, "quarter");

      const exists = await this.db.scoreQuarter.findUnique({
        where: {
          user_id_quarter: { user_id: targetUserId, quarter },
        },
      });
      if (exists) {
        throw new ServiceError(409, "Score já gerado para este trimestre.");
      }

      const targetUser = await this.db.user.findUnique({
        where: { id: targetUserId },
        include: {
          permissions: true,
          permissionRef: true,
        },
      });

      if (!targetUser) {
        throw new ServiceError(404, "Usuário alvo não encontrado.");
      }

      if (targetUser.organization_id !== organizationId) {
        throw new ServiceError(400, "Usuário alvo não pertence à organização.");
      }

      const userPermission = pickOrgPermission(targetUser, organizationId);
      if (!userPermission || userPermission.rh === null || userPermission.rh === undefined) {
        throw new ServiceError(
          400,
          "Usuário alvo sem permissões RH configuradas para esta organização.",
        );
      }

      const isLeader = userPermission.rh === PERMISSION_LEADER;
      const userDept = targetUser.department_id;

      return await this.db.$transaction(async (tx: Prisma.TransactionClient) => {
        const score = await tx.scoreQuarter.create({
          data: {
            user_id: targetUserId,
            quarter,
            organization_id: organizationId,
            nitro: { create: { organization_id: organizationId } },
          },
        });

        const allQuestions = await tx.scoreQuestion.findMany({
          where: { active: true, organization_id: organizationId },
        });

        const createEval = async (
          type: ScoreQuestionType,
          role: ScoreEvaluatorRole,
          specificEvaluatorId: string | null,
        ) => {
          const typeQuestions = allQuestions.filter((q) => q.type === type);
          if (typeQuestions.length === 0) {
            return;
          }

          const initialAnswers = typeQuestions.map((q) => ({
            question_id: q.id,
            question_text: q.question,
            answer: 0,
            obs: "",
          }));

          await tx.scoreEvaluation.create({
            data: {
              score_id: score.id,
              type,
              evaluator_role: role,
              evaluator_id: specificEvaluatorId,
              status: ScoreEvaluationStatus.Pending,
              answers: initialAnswers,
              organization_id: organizationId,
            },
          });
        };

        await createEval(ScoreQuestionType.behavioral, ScoreEvaluatorRole.SELF, targetUserId);
        await createEval(ScoreQuestionType.behavioral, ScoreEvaluatorRole.RH, null);

        if (isLeader) {
          await createEval(ScoreQuestionType.behavioral, ScoreEvaluatorRole.DIRECTOR, null);
        } else {
          const leaderUser = await this.findDepartmentLeader(
            tx,
            organizationId,
            userDept,
            targetUserId,
          );
          if (leaderUser) {
            await createEval(
              ScoreQuestionType.behavioral,
              ScoreEvaluatorRole.LEADER,
              leaderUser.id,
            );
          }
        }

        await createEval(ScoreQuestionType.technical, ScoreEvaluatorRole.SELF, targetUserId);

        if (isLeader) {
          await createEval(ScoreQuestionType.technical, ScoreEvaluatorRole.DIRECTOR, null);
        } else {
          const leaderUser = await this.findDepartmentLeader(
            tx,
            organizationId,
            userDept,
            targetUserId,
          );
          if (leaderUser) {
            await createEval(ScoreQuestionType.technical, ScoreEvaluatorRole.LEADER, leaderUser.id);
          }
        }

        await createEval(ScoreQuestionType.tech, ScoreEvaluatorRole.SELF, targetUserId);
        await createEval(ScoreQuestionType.tech, ScoreEvaluatorRole.TI, null);

        if (isLeader) {
          await createEval(ScoreQuestionType.leadership, ScoreEvaluatorRole.SELF, targetUserId);

          const subordinates = await this.findSubordinates(
            tx,
            organizationId,
            userDept,
            targetUserId,
          );

          for (const sub of subordinates) {
            await createEval(ScoreQuestionType.leadership, ScoreEvaluatorRole.SUBORDINATE, sub.id);
          }
        }

        return score;
      });
    } catch (err: unknown) {
      logError("Erro ao gerar score trimestral", { err });
      if (err instanceof ServiceError) {
        throw err;
      }
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ServiceError(409, "Score já gerado para este trimestre.");
      }
      const msg = err instanceof Error ? err.message : String(err);
      throw new ServiceError(500, `Erro interno ao gerar score trimestral. ${msg}`, err);
    }
  }

  async updateNitro(input: UpdateNitroInput): Promise<unknown> {
    try {
      const organizationId = assertNonEmptyString(input.organization_id, "organization_id");
      const scoreId = assertNonEmptyString(input.score_id, "score_id");

      const nitro = await this.db.scoreNitro.findUnique({
        where: { score_id: scoreId },
        include: { scoreQuarter: true },
      });

      if (!nitro) {
        throw new ServiceError(404, "Registro Nitro não encontrado para este Score.");
      }
      if (
        nitro.organization_id !== organizationId ||
        nitro.scoreQuarter.organization_id !== organizationId
      ) {
        throw new ServiceError(403, "Score Nitro não pertence à organização.");
      }

      let updateData: Prisma.ScoreNitroUpdateInput = {};

      switch (input.type) {
        case "projects":
          updateData = { projects_score: input.value };
          break;
        case "hours":
          updateData = { hours_score: input.value };
          break;
        case "errors":
          updateData = { errors_score: input.value };
          break;
        case "folders":
          updateData = { folders_score: input.value };
          break;
        default:
          throw new ServiceError(400, "Tipo de Nitro inválido.");
      }

      const updatedNitro = await this.db.scoreNitro.update({
        where: { score_id: scoreId },
        data: updateData,
      });

      await this.scoreEvaluation.recalculateScoreQuarterAggregates(scoreId, organizationId);

      return updatedNitro;
    } catch (err: unknown) {
      logError("Erro ao atualizar Nitro do score", { err });
      if (err instanceof ServiceError) {
        throw err;
      }
      const msg = err instanceof Error ? err.message : String(err);
      throw new ServiceError(500, `Erro interno ao atualizar Nitro. ${msg}`, err);
    }
  }

  async listForUser(organizationId: string, userId: string): Promise<unknown> {
    try {
      const orgId = assertNonEmptyString(organizationId, "organization_id");
      const uid = assertNonEmptyString(userId, "user_id");

      return await this.db.scoreQuarter.findMany({
        where: { user_id: uid, organization_id: orgId },
        include: { nitro: true },
        orderBy: { quarter: "desc" },
      });
    } catch (err: unknown) {
      logError("Erro ao listar scores do usuário", { err });
      if (err instanceof ServiceError) {
        throw err;
      }
      const msg = err instanceof Error ? err.message : String(err);
      throw new ServiceError(500, `Erro interno ao listar scores. ${msg}`, err);
    }
  }

  async getDetail(input: GetScoreDetailInput): Promise<unknown> {
    try {
      const organizationId = assertNonEmptyString(input.organization_id, "organization_id");
      const scoreId = assertNonEmptyString(input.score_id, "score_id");

      const score = await this.db.scoreQuarter.findUnique({
        where: { id: scoreId },
        include: {
          user: { select: { id: true, name: true } },
          nitro: true,
          evaluations: {
            include: { evaluator: { select: { name: true } } },
          },
        },
      });

      if (!score) {
        throw new ServiceError(404, "Score não encontrado.");
      }
      if (score.organization_id !== organizationId) {
        throw new ServiceError(403, "Score não pertence à organização.");
      }

      return score;
    } catch (err: unknown) {
      logError("Erro ao obter detalhe do score", { err });
      if (err instanceof ServiceError) {
        throw err;
      }
      const msg = err instanceof Error ? err.message : String(err);
      throw new ServiceError(500, `Erro interno ao obter detalhe do score. ${msg}`, err);
    }
  }
}

export { ScoreQuarterService };
