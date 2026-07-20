import { error as logError, ServiceError } from "@workspace/shared";

import prismaClient from "../integrations/prisma.js";

/** Status de tarefa considerados no cálculo de progresso (legado ProjectService). */
export const TASK_STATUSES_FOR_PROGRESS = [
  "Em andamento",
  "Em Andamento",
  "A Realizar",
  "Em Espera",
  "Concluída",
] as const;

const TASK_STATUS_COMPLETED = "Concluída";
const PROJECT_STATUS_COMPLETED = "Concluído";
const PROJECT_STATUS_IN_PROGRESS = "Em andamento";

const PROGRESS_SELECT = {
  id: true,
  status: true,
  porcentage: true,
  client_id: true,
} as const;

export type ProjectProgressRow = {
  id: string;
  status: string;
  porcentage: number;
  client_id: string;
};

export type ProjectProgressResult = {
  project: ProjectProgressRow;
};

export type ProjectProgressPrisma = typeof prismaClient;
type ProjectProgressTransaction = Pick<ProjectProgressPrisma, "project" | "client">;

export class ProjectProgressService {
  constructor(private readonly prisma: ProjectProgressPrisma = prismaClient) {}

  /**
   * Recalcula porcentagem e status do projeto a partir das tarefas (comportamento alinhado ao legado).
   */
  async recalculateFromTasks(
    projectId: string,
    organizationId: string,
  ): Promise<ProjectProgressResult> {
    try {
      const exists = await this.prisma.project.findFirst({
        where: { id: projectId, organization_id: organizationId },
        select: { id: true, client_id: true },
      });

      if (!exists) {
        throw new ServiceError(404, "Projeto não existe");
      }

      const statusCounts = await this.prisma.task.groupBy({
        by: ["status"],
        where: {
          project_id: projectId,
          organization_id: organizationId,
          status: { in: [...TASK_STATUSES_FOR_PROGRESS] },
        },
        _count: { status: true },
      });

      if (!statusCounts || statusCounts.length === 0) {
        const project = await this.prisma.project.update({
          where: { id: projectId },
          data: { porcentage: 0 },
          select: PROGRESS_SELECT,
        });
        return { project };
      }

      let totalTasks = 0;
      let completedTasks = 0;
      for (const group of statusCounts) {
        const count = group._count.status;
        totalTasks += count;
        if (group.status === TASK_STATUS_COMPLETED) {
          completedTasks = count;
        }
      }

      const percentage = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;
      const roundedPercentage = Math.round(percentage * 100) / 100;
      const newStatus =
        roundedPercentage === 100 ? PROJECT_STATUS_COMPLETED : PROJECT_STATUS_IN_PROGRESS;

      if (roundedPercentage === 100) {
        return await this.prisma.$transaction(async (tx: ProjectProgressTransaction) => {
          const project = await tx.project.update({
            where: { id: projectId },
            data: {
              status: newStatus,
              porcentage: roundedPercentage,
            },
            select: PROGRESS_SELECT,
          });

          const client = await tx.client.findFirst({
            where: { id: exists.client_id, organization_id: organizationId },
          });
          if (!client) {
            throw new ServiceError(404, "Cliente não existe");
          }
          if (client.service_unique === true) {
            await tx.client.update({
              where: { id: client.id },
              data: { status: "Inativo" },
            });
          }

          return { project };
        });
      }

      const project = await this.prisma.project.update({
        where: { id: projectId },
        data: {
          status: newStatus,
          porcentage: roundedPercentage,
        },
        select: PROGRESS_SELECT,
      });

      return { project };
    } catch (err: unknown) {
      logError("Erro ao recalcular progresso do projeto", { err });
      if (err instanceof ServiceError) {
        throw err;
      }
      throw new ServiceError(500, "Erro ao recalcular progresso do projeto.", err);
    }
  }
}
