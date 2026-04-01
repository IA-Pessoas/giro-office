import { assertNonEmptyString, error as logError, ServiceError } from "@workspace/shared";
import type { Prisma, PrismaClient } from "../generated/prisma/client.js";
import { ScoreEvaluationStatus } from "../generated/prisma/client.js";
import { prismaClient } from "../integrations/prisma.js";
import type { UpdateScoreNitroBody } from "../schemas/scoreNitro.schemas.js";

const SCORE_NITRO_SELECT = {
  id: true,
  score_id: true,
  projects_score: true,
  hours_score: true,
  errors_score: true,
  folders_score: true,
  total_hours: true,
  total_errors: true,
  organization_id: true,
} as const;

export type ScoreNitroSnapshot = Prisma.ScoreNitroGetPayload<{
  select: typeof SCORE_NITRO_SELECT;
}>;

type NitroMetricType = UpdateScoreNitroBody["type"];

export class ScoreNitroService {
  constructor(private readonly db: PrismaClient = prismaClient) {}

  private async recalculateFinalScore(scoreId: string, organizationId: string): Promise<void> {
    const score = await this.db.scoreQuarter.findUnique({
      where: { id: scoreId },
      include: { evaluations: true, nitro: true },
    });

    if (!score?.nitro) {
      return;
    }

    if (score.organization_id !== organizationId) {
      throw new ServiceError(403, "Score não pertence à organização informada.");
    }

    const sums = { behavioral: 0, technical: 0, leadership: 0, tech: 0 };
    const counts = { behavioral: 0, technical: 0, leadership: 0, tech: 0 };

    for (const ev of score.evaluations) {
      if (ev.status !== ScoreEvaluationStatus.Completed) {
        continue;
      }
      const t = ev.type;
      if (t === "behavioral" || t === "technical" || t === "tech" || t === "leadership") {
        sums[t] += ev.average_score;
        counts[t] += 1;
      }
    }

    const finalBehavioral = counts.behavioral > 0 ? sums.behavioral / counts.behavioral : 0;
    const finalTechnical = counts.technical > 0 ? sums.technical / counts.technical : 0;
    const finalTech = counts.tech > 0 ? sums.tech / counts.tech : 0;
    const finalLeadership = counts.leadership > 0 ? sums.leadership / counts.leadership : 0;

    await this.db.scoreQuarter.update({
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

    if (finalScore > 10) {
      finalScore = 10;
    }
    if (finalScore < 0) {
      finalScore = 0;
    }

    await this.db.scoreQuarter.update({
      where: { id: scoreId },
      data: { final_score: finalScore },
    });
  }

  private buildNitroUpdateData(
    type: NitroMetricType,
    value: number,
  ): Pick<
    Prisma.ScoreNitroUpdateInput,
    "projects_score" | "hours_score" | "errors_score" | "folders_score"
  > {
    switch (type) {
      case "projects":
        return { projects_score: value };
      case "hours":
        return { hours_score: value };
      case "errors":
        return { errors_score: value };
      case "folders":
        return { folders_score: value };
    }
  }

  async updateMetric(
    organizationId: string,
    _userId: string,
    input: UpdateScoreNitroBody,
  ): Promise<ScoreNitroSnapshot> {
    try {
      const orgId = assertNonEmptyString(organizationId, "organization_id");
      const scoreId = assertNonEmptyString(input.score_id, "score_id");

      const nitro = await this.db.scoreNitro.findUnique({
        where: { score_id: scoreId },
        select: { ...SCORE_NITRO_SELECT },
      });

      if (!nitro) {
        throw new ServiceError(404, "Registro Nitro não encontrado para este score.");
      }

      if (nitro.organization_id !== orgId) {
        throw new ServiceError(404, "Registro Nitro não encontrado para este score.");
      }

      const data = this.buildNitroUpdateData(input.type, input.value);

      const updated = await this.db.scoreNitro.update({
        where: { score_id: scoreId },
        data,
        select: SCORE_NITRO_SELECT,
      });

      await this.recalculateFinalScore(scoreId, orgId);

      return updated;
    } catch (err: unknown) {
      logError("Erro ao atualizar métrica Nitro", { err });
      if (err instanceof ServiceError) {
        throw err;
      }
      const msg = err instanceof Error ? err.message : String(err);
      throw new ServiceError(500, `Erro interno ao atualizar métrica Nitro. ${msg}`, err);
    }
  }
}
