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

export class TiRobotService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(context: TiAuthContext, query: ListTiRobotsQuery): Promise<unknown[]> {
    const { skip, take } = getPaginationParams(query);

    return this.prisma.tIRobot.findMany({
      where: {
        organization_id: context.organizationId,
        ...(query.type ? { type: query.type } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.active === undefined ? {} : { active: query.active }),
      },
      orderBy: { name: "asc" },
      skip,
      take,
    });
  }

  async getById(context: TiAuthContext, id: string): Promise<unknown> {
    return this.ensureRobot(context, id);
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
      throw new ServiceError(500, "Erro ao registrar execucao de robo de TI.", err);
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
      throw new ServiceError(404, "Robo de TI nao encontrado.");
    }

    return robot;
  }
}
