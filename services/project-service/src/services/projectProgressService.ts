import {
  getProgressProjectStatus,
  INTEGRACAO_PERMISSION_LEVEL,
  type IntegracaoPermissionLevel,
  error as logError,
  PROJECT_STATUS_WAITING_COMMERCIAL,
  requireIntegracaoRouteAccess,
  ServiceError,
} from "@workspace/shared";

import * as audit from "../integrations/audit.js";
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

export interface ProjectProgressAuthorization {
  userId: string;
  integracaoLevel?: IntegracaoPermissionLevel;
  isOwner?: boolean;
}

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
    authorization: ProjectProgressAuthorization = { userId: "" },
  ): Promise<ProjectProgressResult> {
    try {
      const exists = await this.prisma.project.findFirst({
        where: { id: projectId, organization_id: organizationId },
        select: { id: true, client_id: true, status: true },
      });

      if (!exists) {
        throw new ServiceError(404, "Projeto não existe");
      }
      if (exists.status === PROJECT_STATUS_WAITING_COMMERCIAL) {
        throw new ServiceError(409, "O projeto aguarda liberação do Comercial.");
      }

      requireIntegracaoRouteAccess("POST", "/project/progress", {
        userId: authorization.userId,
        level: authorization.integracaoLevel ?? INTEGRACAO_PERMISSION_LEVEL.BASIC,
        organizationId,
        resourceOrganizationId: organizationId,
        isOwner: authorization.isOwner === true,
        requestedFields: ["project_id"],
      });

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
        await audit.createLog({
          userId: authorization.userId,
          organizationId,
          action: "Atualização de progresso",
          referring: "integracao.projects",
          referringId: projectId,
          changes: { porcentage: 0 },
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
      const newStatus = getProgressProjectStatus(exists.status, roundedPercentage);

      if (roundedPercentage === 100) {
        if (
          authorization.integracaoLevel !== INTEGRACAO_PERMISSION_LEVEL.ADMIN &&
          authorization.isOwner !== true
        ) {
          throw new ServiceError(403, "Acesso negado para inativar o cliente pelo progresso.");
        }

        const project = await this.prisma.$transaction(async (tx: ProjectProgressTransaction) => {
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
              data: { status: "Inativo", deletion_date: new Date() },
            });
          }

          return project;
        });

        await audit.createLog({
          userId: authorization.userId,
          organizationId,
          action: "Atualização de progresso",
          referring: "integracao.projects",
          referringId: projectId,
          changes: { status: newStatus, porcentage: roundedPercentage },
        });

        return { project };
      }

      const project = await this.prisma.project.update({
        where: { id: projectId },
        data: {
          status: newStatus,
          porcentage: roundedPercentage,
        },
        select: PROGRESS_SELECT,
      });

      await audit.createLog({
        userId: authorization.userId,
        organizationId,
        action: "Atualização de progresso",
        referring: "integracao.projects",
        referringId: projectId,
        changes: { status: newStatus, porcentage: roundedPercentage },
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
