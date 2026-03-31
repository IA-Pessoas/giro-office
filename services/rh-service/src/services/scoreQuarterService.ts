import { assertNonEmptyString, error as logError, ServiceError } from "@workspace/shared";

import {
  Prisma,
  ScoreEvaluationStatus,
  ScoreEvaluatorRole,
  ScoreQuestionType,
} from "../generated/prisma/client.js";
import { prismaClient } from "../integrations/prisma.js";

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

export interface SubmitEvaluationInput {
  organization_id: string;
  evaluation_id: string;
  answers: { question_id: string; answer: number; obs?: string }[];
}

export interface UpdateNitroInput {
  organization_id: string;
  score_id: string;
  type: "projects" | "hours" | "errors" | "folders";
  value: number;
}

export interface ListPendingEvaluationsInput {
  organization_id: string;
  user_id: string;
}

export interface GetScoreDetailInput {
  organization_id: string;
  score_id: string;
}

class ScoreQuarterService {
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

  private async recalculateFinalScore(scoreId: string): Promise<void> {
    const score = await prismaClient.scoreQuarter.findUnique({
      where: { id: scoreId },
      include: { evaluations: true, nitro: true },
    });

    if (!score?.nitro) {
      return;
    }

    const sums = { behavioral: 0, technical: 0, leadership: 0, tech: 0 };
    const counts = { behavioral: 0, technical: 0, leadership: 0, tech: 0 };

    for (const ev of score.evaluations) {
      if (ev.status === ScoreEvaluationStatus.Completed) {
        const type = ev.type as keyof typeof sums;
        if (type in sums) {
          sums[type] += ev.average_score;
          counts[type] += 1;
        }
      }
    }

    const finalBehavioral = counts.behavioral > 0 ? sums.behavioral / counts.behavioral : 0;
    const finalTechnical = counts.technical > 0 ? sums.technical / counts.technical : 0;
    const finalTech = counts.tech > 0 ? sums.tech / counts.tech : 0;
    const finalLeadership = counts.leadership > 0 ? sums.leadership / counts.leadership : 0;

    await prismaClient.scoreQuarter.update({
      where: { id: scoreId },
      data: {
        behavioral: finalBehavioral,
        technical: finalTechnical,
        technology: finalTech,
        leadership: finalLeadership,
      },
    });

    let sumBase = 0;
    let validBase = 0;

    if (counts.behavioral > 0) {
      sumBase += finalBehavioral;
      validBase += 1;
    }
    if (counts.technical > 0) {
      sumBase += finalTechnical;
      validBase += 1;
    }
    if (counts.tech > 0) {
      sumBase += finalTech;
      validBase += 1;
    }
    if (counts.leadership > 0) {
      sumBase += finalLeadership;
      validBase += 1;
    }

    const baseScore = validBase > 0 ? sumBase / validBase : 0;

    let finalScore =
      baseScore +
      score.nitro.projects_score +
      score.nitro.hours_score -
      score.nitro.errors_score +
      score.nitro.folders_score;

    if (finalScore > 10) finalScore = 10;
    if (finalScore < 0) finalScore = 0;

    await prismaClient.scoreQuarter.update({
      where: { id: scoreId },
      data: { final_score: finalScore },
    });
  }

  async generateQuarterlyScore(input: GenerateQuarterlyScoreInput): Promise<unknown> {
    try {
      const organizationId = assertNonEmptyString(input.organization_id, "organization_id");
      const targetUserId = assertNonEmptyString(input.target_user_id, "target_user_id");
      const quarter = assertNonEmptyString(input.quarter, "quarter");

      const exists = await prismaClient.scoreQuarter.findUnique({
        where: {
          user_id_quarter: { user_id: targetUserId, quarter },
        },
      });
      if (exists) {
        throw new ServiceError(409, "Score já gerado para este trimestre.");
      }

      const targetUser = await prismaClient.user.findUnique({
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

      return await prismaClient.$transaction(async (tx: Prisma.TransactionClient) => {
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

  async submitEvaluation(input: SubmitEvaluationInput): Promise<{ message: string }> {
    try {
      const organizationId = assertNonEmptyString(input.organization_id, "organization_id");
      const evaluationId = assertNonEmptyString(input.evaluation_id, "evaluation_id");
      const answers = input.answers;

      const evaluation = await prismaClient.scoreEvaluation.findUnique({
        where: { id: evaluationId },
        include: { scoreQuarter: true },
      });

      if (!evaluation) {
        throw new ServiceError(404, "Avaliação não encontrada.");
      }
      if (evaluation.organization_id !== organizationId) {
        throw new ServiceError(403, "Avaliação não pertence à organização.");
      }
      if (evaluation.scoreQuarter.organization_id !== organizationId) {
        throw new ServiceError(403, "Score não pertence à organização.");
      }
      if (evaluation.status === ScoreEvaluationStatus.Completed) {
        throw new ServiceError(400, "Avaliação já concluída.");
      }

      let sum = 0;
      for (const a of answers) {
        sum += a.answer;
      }
      const average = answers.length > 0 ? sum / answers.length : 0;

      await prismaClient.scoreEvaluation.update({
        where: { id: evaluationId },
        data: {
          answers: answers as unknown as Prisma.InputJsonValue,
          average_score: average,
          status: ScoreEvaluationStatus.Completed,
        },
      });

      await this.recalculateFinalScore(evaluation.score_id);

      return { message: "Avaliação enviada com sucesso" };
    } catch (err: unknown) {
      logError("Erro ao submeter avaliação de score", { err });
      if (err instanceof ServiceError) {
        throw err;
      }
      const msg = err instanceof Error ? err.message : String(err);
      throw new ServiceError(500, `Erro interno ao submeter avaliação. ${msg}`, err);
    }
  }

  async updateNitro(input: UpdateNitroInput): Promise<unknown> {
    try {
      const organizationId = assertNonEmptyString(input.organization_id, "organization_id");
      const scoreId = assertNonEmptyString(input.score_id, "score_id");

      const nitro = await prismaClient.scoreNitro.findUnique({
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

      const updatedNitro = await prismaClient.scoreNitro.update({
        where: { score_id: scoreId },
        data: updateData,
      });

      await this.recalculateFinalScore(scoreId);

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

      return await prismaClient.scoreQuarter.findMany({
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

      const score = await prismaClient.scoreQuarter.findUnique({
        where: { id: scoreId },
        include: {
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

  async listPendingEvaluations(input: ListPendingEvaluationsInput): Promise<unknown> {
    try {
      const organizationId = assertNonEmptyString(input.organization_id, "organization_id");
      const userId = assertNonEmptyString(input.user_id, "user_id");

      const me = await prismaClient.user.findUnique({
        where: { id: userId },
        include: { permissions: true, permissionRef: true },
      });

      if (!me) {
        throw new ServiceError(404, "Usuário não encontrado.");
      }

      const myRoles: ScoreEvaluatorRole[] = [ScoreEvaluatorRole.SELF];

      const orgPerm = pickOrgPermission(me, organizationId);
      if (orgPerm?.rh === 2) {
        myRoles.push(ScoreEvaluatorRole.RH);
      }
      if (me.permission === 1) {
        myRoles.push(ScoreEvaluatorRole.TI);
      }
      if (me.permission === 2) {
        myRoles.push(ScoreEvaluatorRole.DIRECTOR);
      }

      return await prismaClient.scoreEvaluation.findMany({
        where: {
          status: ScoreEvaluationStatus.Pending,
          organization_id: organizationId,
          scoreQuarter: { organization_id: organizationId },
          OR: [
            { evaluator_id: userId },
            {
              evaluator_id: null,
              evaluator_role: { in: myRoles },
            },
          ],
        },
        include: {
          scoreQuarter: {
            include: {
              user: { select: { name: true } },
            },
          },
        },
      });
    } catch (err: unknown) {
      logError("Erro ao listar avaliações pendentes de score", { err });
      if (err instanceof ServiceError) {
        throw err;
      }
      const msg = err instanceof Error ? err.message : String(err);
      throw new ServiceError(500, `Erro interno ao listar avaliações pendentes. ${msg}`, err);
    }
  }
}

export { ScoreQuarterService };
