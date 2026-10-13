import { assertNonEmptyString, error as logError, ServiceError } from "@workspace/shared";

import { Prisma, type PrismaClient } from "../generated/prisma/client.js";
import { prismaClient } from "../integrations/prisma.js";

const WEEKS_PER_CYCLE = 4;
const MAX_CONFIGURED_FLOORS = 4;

const OCCURRENCE_WEIGHTS = {
  organization: 1,
  cleanliness: 1,
  delays: 2,
  cellphone: 2,
  conversations: 1,
  demands: 1,
  dress_code: 1,
} as const;

export type CceOccurrences = { [Occurrence in keyof typeof OCCURRENCE_WEIGHTS]: boolean };

export interface ConfigureCceFloorsInput {
  organization_id: string;
  floor_count: number;
}

export interface CreateCceCycleInput {
  organization_id: string;
  created_by_user_id: string;
  year: number;
  month: number;
}

export interface ListCceCyclesInput {
  organization_id: string;
  year?: number;
  month?: number;
}

export interface UpdateCceWeeklyEvaluationInput {
  organization_id: string;
  evaluation_id: string;
  monitor_user_id: string;
  evaluated_at: string;
  occurrences: CceOccurrences;
}

export function calculateCceWeeklyTotal(occurrences: CceOccurrences): number {
  return Object.entries(OCCURRENCE_WEIGHTS).reduce(
    (total, [occurrence, weight]) =>
      occurrences[occurrence as keyof CceOccurrences] ? total + weight : total,
    0,
  );
}

class CceCycleService {
  constructor(private readonly db: PrismaClient = prismaClient) {}

  async getFloorConfiguration(
    organizationId: string,
  ): Promise<{ organization_id: string; floor_count: number }> {
    try {
      const orgId = assertNonEmptyString(organizationId, "organization_id");
      const configuration = await this.db.cceFloorConfiguration.findUnique({
        where: { organization_id: orgId },
      });

      return configuration ?? { organization_id: orgId, floor_count: MAX_CONFIGURED_FLOORS };
    } catch (err: unknown) {
      logError("Erro ao consultar configuração de andares do CCE", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro interno ao consultar configuração do CCE.", err);
    }
  }

  async configureFloors(input: ConfigureCceFloorsInput): Promise<unknown> {
    try {
      const organizationId = assertNonEmptyString(input.organization_id, "organization_id");
      if (
        !Number.isInteger(input.floor_count) ||
        input.floor_count < 0 ||
        input.floor_count > MAX_CONFIGURED_FLOORS
      ) {
        throw new ServiceError(400, "A quantidade de andares deve estar entre 0 e 4.");
      }

      return await this.db.cceFloorConfiguration.upsert({
        where: { organization_id: organizationId },
        create: { organization_id: organizationId, floor_count: input.floor_count },
        update: { floor_count: input.floor_count },
      });
    } catch (err: unknown) {
      logError("Erro ao configurar andares do CCE", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro interno ao configurar andares do CCE.", err);
    }
  }

  async createCycle(input: CreateCceCycleInput): Promise<unknown> {
    try {
      const organizationId = assertNonEmptyString(input.organization_id, "organization_id");
      const createdByUserId = assertNonEmptyString(input.created_by_user_id, "created_by_user_id");
      if (!Number.isInteger(input.year) || input.year < 1 || input.year > 9999) {
        throw new ServiceError(400, "Ano inválido para o ciclo CCE.");
      }
      if (!Number.isInteger(input.month) || input.month < 1 || input.month > 12) {
        throw new ServiceError(400, "Mês inválido para o ciclo CCE.");
      }

      const creator = await this.db.user.findFirst({
        where: { id: createdByUserId, organization_id: organizationId },
        select: { id: true },
      });
      if (!creator) {
        throw new ServiceError(404, "Usuário gestor não pertence à organização.");
      }

      const configuration = await this.getFloorConfiguration(organizationId);

      return await this.db.$transaction(async (tx: Prisma.TransactionClient) => {
        const existingCycle = await tx.cceCycle.findUnique({
          where: {
            organization_id_year_month: {
              organization_id: organizationId,
              year: input.year,
              month: input.month,
            },
          },
        });
        if (existingCycle) {
          throw new ServiceError(409, "Já existe um ciclo CCE para este ano e mês.");
        }

        const cycle = await tx.cceCycle.create({
          data: {
            organization_id: organizationId,
            created_by_user_id: createdByUserId,
            year: input.year,
            month: input.month,
          },
        });

        await tx.cceWeeklyEvaluation.createMany({
          data: Array.from({ length: configuration.floor_count }, (_, floor) =>
            Array.from({ length: WEEKS_PER_CYCLE }, (_unused, weekIndex) => ({
              cycle_id: cycle.id,
              floor,
              week: weekIndex + 1,
            })),
          ).flat(),
        });

        return cycle;
      });
    } catch (err: unknown) {
      logError("Erro ao criar ciclo CCE", { err });
      if (err instanceof ServiceError) throw err;
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ServiceError(409, "Já existe um ciclo CCE para este ano e mês.");
      }
      throw new ServiceError(500, "Erro interno ao criar ciclo CCE.", err);
    }
  }

  async listCycles(input: ListCceCyclesInput): Promise<unknown[]> {
    try {
      const organizationId = assertNonEmptyString(input.organization_id, "organization_id");
      const cycles = await this.db.cceCycle.findMany({
        where: {
          organization_id: organizationId,
          ...(input.year ? { year: input.year } : {}),
          ...(input.month ? { month: input.month } : {}),
        },
        include: {
          weekly_evaluations: {
            include: { monitor: { select: { id: true, name: true } } },
            orderBy: [{ floor: "asc" }, { week: "asc" }],
          },
        },
        orderBy: [{ year: "desc" }, { month: "desc" }],
      });

      return cycles.map((cycle) => ({
        ...cycle,
        weekly_evaluations: cycle.weekly_evaluations.map((evaluation) => ({
          ...evaluation,
          total: evaluation.completed_at ? calculateCceWeeklyTotal(evaluation) : null,
        })),
      }));
    } catch (err: unknown) {
      logError("Erro ao listar ciclos CCE", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro interno ao listar ciclos CCE.", err);
    }
  }

  async updateWeeklyEvaluation(input: UpdateCceWeeklyEvaluationInput): Promise<{ total: number }> {
    try {
      const organizationId = assertNonEmptyString(input.organization_id, "organization_id");
      const evaluationId = assertNonEmptyString(input.evaluation_id, "evaluation_id");
      const monitorUserId = assertNonEmptyString(input.monitor_user_id, "monitor_user_id");
      const evaluatedAt = new Date(input.evaluated_at);
      if (Number.isNaN(evaluatedAt.getTime())) {
        throw new ServiceError(400, "Data da avaliação inválida.");
      }

      const evaluation = await this.db.cceWeeklyEvaluation.findFirst({
        where: { id: evaluationId, cycle: { organization_id: organizationId } },
      });
      if (!evaluation) {
        throw new ServiceError(404, "Avaliação CCE não encontrada nesta organização.");
      }
      if (evaluation.completed_at) {
        throw new ServiceError(409, "Esta avaliação semanal do CCE já foi concluída.");
      }

      const monitor = await this.db.user.findFirst({
        where: { id: monitorUserId, organization_id: organizationId },
        select: { id: true },
      });
      if (!monitor) {
        throw new ServiceError(404, "Monitor não pertence à organização.");
      }

      const update = await this.db.cceWeeklyEvaluation.updateMany({
        where: { id: evaluationId, completed_at: null },
        data: {
          monitor_user_id: monitorUserId,
          evaluated_at: evaluatedAt,
          completed_at: new Date(),
          ...input.occurrences,
        },
      });
      if (update.count === 0) {
        throw new ServiceError(409, "Esta avaliação semanal do CCE já foi concluída.");
      }

      const updatedEvaluation = await this.db.cceWeeklyEvaluation.findFirst({
        where: { id: evaluationId, cycle: { organization_id: organizationId } },
        include: { monitor: { select: { id: true, name: true } } },
      });
      if (!updatedEvaluation) {
        throw new ServiceError(404, "Avaliação CCE não encontrada nesta organização.");
      }

      return {
        ...updatedEvaluation,
        total: calculateCceWeeklyTotal(updatedEvaluation),
      };
    } catch (err: unknown) {
      logError("Erro ao registrar avaliação semanal do CCE", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro interno ao registrar avaliação semanal do CCE.", err);
    }
  }
}

export { CceCycleService };
