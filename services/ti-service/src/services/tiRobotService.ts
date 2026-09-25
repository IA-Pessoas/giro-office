import { error as logError, ServiceError } from "@workspace/shared";

import type { Prisma, PrismaClient } from "../generated/prisma/client.js";
import { getPaginationParams } from "../schemas/pagination.schemas.js";
import type {
  CreateTiRobotBody,
  CreateTiRobotRunBody,
  ListTiRobotRunsQuery,
  ListTiRobotsQuery,
  UpdateTiRobotBody,
} from "../schemas/tiRobot.schemas.js";
import type { TiAuthContext } from "./tiRequestService.js";

const robotLatestRunInclude = {
  runs: {
    orderBy: { started_at: "desc" },
    take: 1,
    select: {
      status: true,
      started_at: true,
      finished_at: true,
    },
  },
} satisfies Prisma.TIRobotInclude;

type RobotRunSummary = {
  status: string | null;
  started_at: Date | string | null;
  finished_at: Date | string | null;
};

type RobotWithLatestRun = Record<string, unknown> & {
  runs?: RobotRunSummary[];
};

function toIsoDate(value: Date | string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : value;
}

function withLatestRunSummary(robot: RobotWithLatestRun): Record<string, unknown> {
  const { runs, ...robotData } = robot;
  const latestRun = runs?.[0];

  return {
    ...robotData,
    last_status: latestRun?.status ?? null,
    last_run_at: toIsoDate(latestRun?.finished_at ?? latestRun?.started_at),
  };
}

export class TiRobotService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(context: TiAuthContext, query: ListTiRobotsQuery): Promise<unknown[]> {
    const { skip, take } = getPaginationParams(query);

    const robots = await this.prisma.tIRobot.findMany({
      where: {
        organization_id: context.organizationId,
        ...(query.type ? { type: query.type } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.active === undefined ? {} : { active: query.active }),
      },
      include: robotLatestRunInclude,
      orderBy: { name: "asc" },
      skip,
      take,
    });

    return robots.map(withLatestRunSummary);
  }

  async getById(context: TiAuthContext, id: string): Promise<unknown> {
    const robot = await this.prisma.tIRobot.findFirst({
      where: { id, organization_id: context.organizationId },
      include: robotLatestRunInclude,
    });

    if (!robot) {
      throw new ServiceError(404, "Robô de TI não encontrado.");
    }

    return withLatestRunSummary(robot);
  }

  async create(context: TiAuthContext, body: CreateTiRobotBody): Promise<unknown> {
    try {
      return this.prisma.tIRobot.create({
        data: {
          ...body,
          organization_id: context.organizationId,
        },
      });
    } catch (err: unknown) {
      logError("Erro ao criar robo de TI", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro ao criar robo de TI.", err);
    }
  }

  async update(context: TiAuthContext, id: string, body: UpdateTiRobotBody): Promise<unknown> {
    try {
      await this.ensureRobot(context, id);

      return this.prisma.tIRobot.update({
        where: { id },
        data: body,
      });
    } catch (err: unknown) {
      logError("Erro ao atualizar robo de TI", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro ao atualizar robo de TI.", err);
    }
  }

  async createRun(
    context: TiAuthContext,
    robotId: string,
    body: CreateTiRobotRunBody,
  ): Promise<unknown> {
    try {
      await this.ensureRobot(context, robotId);

      return this.prisma.tIRobotRun.create({
        data: {
          robot_id: robotId,
          status: body.status,
          finished_at: body.finished_at,
          message: body.message,
          metadata_json: body.metadata_json as Prisma.InputJsonValue | undefined,
          organization_id: context.organizationId,
        },
      });
    } catch (err: unknown) {
      logError("Erro ao registrar execucao de robo de TI", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro ao registrar execução de robô de TI.", err);
    }
  }

  async listRuns(
    context: TiAuthContext,
    robotId: string,
    query: ListTiRobotRunsQuery,
  ): Promise<unknown[]> {
    await this.ensureRobot(context, robotId);
    const { skip, take } = getPaginationParams(query);

    return this.prisma.tIRobotRun.findMany({
      where: {
        robot_id: robotId,
        organization_id: context.organizationId,
        ...(query.status ? { status: query.status } : {}),
      },
      orderBy: { started_at: "desc" },
      skip,
      take,
    });
  }

  private async ensureRobot(
    context: Pick<TiAuthContext, "organizationId">,
    id: string,
  ): Promise<unknown> {
    const robot = await this.prisma.tIRobot.findFirst({
      where: { id, organization_id: context.organizationId },
    });

    if (!robot) {
      throw new ServiceError(404, "Robô de TI não encontrado.");
    }

    return robot;
  }
}
