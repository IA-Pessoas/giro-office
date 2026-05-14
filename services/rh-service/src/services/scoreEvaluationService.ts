import { assertNonEmptyString, error as logError, ServiceError } from "@workspace/shared";

import {
  type Prisma,
  type PrismaClient,
  ScoreEvaluationStatus,
  ScoreEvaluatorRole,
} from "../generated/prisma/client.js";
import { prismaClient } from "../integrations/prisma.js";

/** Heurística herdada do legado (`ScoreController.listPendingEvaluations`). */
const RH_PERMISSION_ADMIN_LEVEL = 2;
const USER_PERMISSION_TI = 1;
const USER_PERMISSION_DIRECTOR = 2;

const LIST_PENDING_INCLUDE = {
  scoreQuarter: {
    include: {
      user: { select: { name: true } },
    },
  },
} as const;

export type ScoreEvaluationAnswerItem = {
  question_id: string;
  answer: number;
  obs?: string;
};

export interface SubmitScoreEvaluationInput {
  organization_id: string;
  user_id: string;
  evaluation_id: string;
  answers: ScoreEvaluationAnswerItem[];
}

export class ScoreEvaluationService {
  constructor(private readonly prisma: PrismaClient = prismaClient) {}

  /**
   * Papéis genéricos (evaluator_id null) que o utilizador pode assumir na listagem/submissão.
   * SELF, RH, TI e DIRECTOR vêm do legado; avaliações com evaluator_id explícito usam outra ramificação na query.
   */
  private async resolveGenericEvaluatorRoles(
    organizationId: string,
    userId: string,
  ): Promise<ScoreEvaluatorRole[]> {
    const orgId = assertNonEmptyString(organizationId, "organization_id");
    const uid = assertNonEmptyString(userId, "user_id");

    const user = await this.prisma.user.findUnique({
      where: { id: uid },
      select: {
        permission: true,
        permissions: {
          where: { organization_id: orgId },
          select: { rh: true },
          take: 1,
          orderBy: { id: "asc" },
        },
      },
    });

    if (!user) {
      throw new ServiceError(404, "Utilizador não encontrado.");
    }

    const roles: ScoreEvaluatorRole[] = [ScoreEvaluatorRole.SELF];

    const firstRh = user.permissions[0]?.rh;
    if (firstRh === RH_PERMISSION_ADMIN_LEVEL) {
      roles.push(ScoreEvaluatorRole.RH);
    }
    if (user.permission === USER_PERMISSION_TI) {
      roles.push(ScoreEvaluatorRole.TI);
    }
    if (user.permission === USER_PERMISSION_DIRECTOR) {
      roles.push(ScoreEvaluatorRole.DIRECTOR);
    }

    return roles;
  }

  private async userCanActOnEvaluation(
    organizationId: string,
    userId: string,
    evaluation: {
      organization_id: string;
      evaluator_id: string | null;
      evaluator_role: ScoreEvaluatorRole;
    },
  ): Promise<boolean> {
    if (evaluation.organization_id !== organizationId) {
      return false;
    }
    if (evaluation.evaluator_id === userId) {
      return true;
    }
    if (evaluation.evaluator_id !== null) {
      return false;
    }
    const genericRoles = await this.resolveGenericEvaluatorRoles(organizationId, userId);
    return genericRoles.includes(evaluation.evaluator_role);
  }

  /**
   * Recalcula médias por eixo e `final_score` do trimestre (avaliações concluídas + Nitro).
   * Usado após submeter uma avaliação ou quando o trimestre é alterado por Nitro.
   */
  async recalculateScoreQuarterAggregates(scoreId: string, organizationId: string): Promise<void> {
    const orgId = assertNonEmptyString(organizationId, "organization_id");
    const sid = assertNonEmptyString(scoreId, "score_id");

    const score = await this.prisma.scoreQuarter.findFirst({
      where: { id: sid, organization_id: orgId },
      include: { evaluations: true, nitro: true },
    });

    if (!score?.nitro) {
      return;
    }

    const sums = {
      behavioral: 0,
      technical: 0,
      leadership: 0,
      tech: 0,
    };
    const counts = { ...sums };

    for (const ev of score.evaluations) {
      if (ev.status !== ScoreEvaluationStatus.Completed) {
        continue;
      }
      const type = ev.type as keyof typeof sums;
      if (sums[type] === undefined) {
        continue;
      }
      sums[type] += ev.average_score;
      counts[type] += 1;
    }

    const finalBehavioral = counts.behavioral > 0 ? sums.behavioral / counts.behavioral : 0;
    const finalTechnical = counts.technical > 0 ? sums.technical / counts.technical : 0;
    const finalTech = counts.tech > 0 ? sums.tech / counts.tech : 0;
    const finalLeadership = counts.leadership > 0 ? sums.leadership / counts.leadership : 0;

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

    await this.prisma.scoreQuarter.update({
      where: { id: sid },
      data: {
        behavioral: finalBehavioral,
        technical: finalTechnical,
        technology: finalTech,
        leadership: finalLeadership,
        final_score: finalScore,
      },
    });
  }

  async listPendingEvaluations(
    organizationId: string,
    userId: string,
  ): Promise<
    Prisma.ScoreEvaluationGetPayload<{
      include: typeof LIST_PENDING_INCLUDE;
    }>[]
  > {
    try {
      const orgId = assertNonEmptyString(organizationId, "organization_id");
      const uid = assertNonEmptyString(userId, "user_id");

      const genericRoles = await this.resolveGenericEvaluatorRoles(orgId, uid);

      return this.prisma.scoreEvaluation.findMany({
        where: {
          organization_id: orgId,
          status: ScoreEvaluationStatus.Pending,
          OR: [
            { evaluator_id: uid },
            {
              evaluator_id: null,
              evaluator_role: { in: genericRoles },
            },
          ],
        },
        include: LIST_PENDING_INCLUDE,
        orderBy: { id: "asc" },
      });
    } catch (err: unknown) {
      logError("Erro ao listar avaliações pendentes de score", { err });
      if (err instanceof ServiceError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new ServiceError(500, `Erro interno ao listar avaliações pendentes. ${msg}`, err);
    }
  }

  async submitEvaluation(input: SubmitScoreEvaluationInput): Promise<{ message: string }> {
    try {
      const orgId = assertNonEmptyString(input.organization_id, "organization_id");
      const uid = assertNonEmptyString(input.user_id, "user_id");
      const evaluationId = assertNonEmptyString(input.evaluation_id, "evaluation_id");

      const evaluation = await this.prisma.scoreEvaluation.findFirst({
        where: { id: evaluationId, organization_id: orgId },
        include: { scoreQuarter: true },
      });

      if (!evaluation) {
        throw new ServiceError(404, "Avaliação não encontrada.");
      }

      if (evaluation.status === ScoreEvaluationStatus.Completed) {
        throw new ServiceError(409, "Avaliação já concluída.");
      }

      const allowed = await this.userCanActOnEvaluation(orgId, uid, evaluation);
      if (!allowed) {
        throw new ServiceError(403, "Sem permissão para submeter esta avaliação.");
      }

      let sum = 0;
      for (const a of input.answers) {
        sum += a.answer;
      }
      const average = input.answers.length > 0 ? sum / input.answers.length : 0;

      const answersJson = input.answers as unknown as Prisma.InputJsonValue;

      await this.prisma.scoreEvaluation.update({
        where: { id: evaluationId },
        data: {
          answers: answersJson,
          average_score: average,
          status: ScoreEvaluationStatus.Completed,
        },
      });

      await this.recalculateScoreQuarterAggregates(evaluation.score_id, orgId);

      return { message: "Avaliação enviada com sucesso" };
    } catch (err: unknown) {
      logError("Erro ao submeter avaliação de score", { err });
      if (err instanceof ServiceError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new ServiceError(500, `Erro interno ao submeter avaliação. ${msg}`, err);
    }
  }
}
