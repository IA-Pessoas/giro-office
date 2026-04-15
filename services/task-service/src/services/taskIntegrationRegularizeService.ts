import { error as logError, ServiceError } from "@workspace/shared";
import type { TasksIntegrationRegularizeGetPayload } from "../generated/prisma/models/TasksIntegrationRegularize.js";

import * as audit from "../integrations/audit.js";
import prismaClient from "../prisma/index.js";

export interface CreateLinkRequest {
  user_id: string;
  organization_id: string;
  task_model_id: string;
  referring: string;
  referring_type: string;
}

export interface RemoveLinkRequest {
  user_id: string;
  organization_id: string;
  integration_id: string;
}

const TASK_INTEGRATION_SELECT = {
  id: true,
  task_model_id: true,
  referring: true,
  referring_type: true,
  organization_id: true,
  task_model: {
    select: { name: true },
  },
} as const;

export type TaskIntegrationRegularizeRow = TasksIntegrationRegularizeGetPayload<{
  select: typeof TASK_INTEGRATION_SELECT;
}>;

export class TaskIntegrationRegularizeService {
  async createLink(data: CreateLinkRequest): Promise<{ integration: TaskIntegrationRegularizeRow }> {
    try {
      const taskModel = await prismaClient.taskModel.findFirst({
        where: { id: data.task_model_id, organization_id: data.organization_id },
        select: { name: true },
      });

      if (!taskModel) {
        throw new ServiceError(404, "Modelo de Tarefa não encontrado.");
      }

      const alreadyExists = await prismaClient.tasksIntegrationRegularize.findFirst({
        where: {
          task_model_id: data.task_model_id,
          referring: data.referring,
          referring_type: data.referring_type,
          organization_id: data.organization_id,
        },
      });

      if (alreadyExists) {
        throw new ServiceError(
          409,
          "Este tipo de serviço já está vinculado a este modelo de tarefa.",
        );
      }

      const integration = await prismaClient.tasksIntegrationRegularize.create({
        data: {
          task_model_id: data.task_model_id,
          referring: data.referring,
          referring_type: data.referring_type,
          organization_id: data.organization_id,
        },
        select: TASK_INTEGRATION_SELECT,
      });

      await audit.createLog({
        userId: data.user_id,
        organizationId: data.organization_id,
        action: "Vincular Tarefa",
        referring: "integracao.tasks",
        referringId: integration.id,
        changes: `Vinculou ${data.referring} - ${data.referring_type} ao modelo ${taskModel.name}`,
      });

      return { integration };
    } catch (err: unknown) {
      logError("Erro ao vincular integração Regularize", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Não foi possível vincular a integração.", err);
    }
  }

  async removeLink(data: RemoveLinkRequest): Promise<{ message: string }> {
    try {
      const deleted = await prismaClient.tasksIntegrationRegularize.deleteMany({
        where: { id: data.integration_id, organization_id: data.organization_id },
      });

      if (deleted.count === 0) {
        throw new ServiceError(404, "Vínculo não encontrado.");
      }

      await audit.createLog({
        userId: data.user_id,
        organizationId: data.organization_id,
        action: "Desvincular Tarefa",
        referring: "integracao.tasks",
        referringId: data.integration_id,
        changes: "{}",
      });

      return { message: "Vínculo removido com sucesso." };
    } catch (err: unknown) {
      logError("Erro ao remover vínculo de integração Regularize", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Não foi possível remover o vínculo.", err);
    }
  }

  async list(
    organizationId: string,
    taskModelId?: string,
  ): Promise<TaskIntegrationRegularizeRow[]> {
    try {
      const list = await prismaClient.tasksIntegrationRegularize.findMany({
        where: {
          organization_id: organizationId,
          ...(taskModelId ? { task_model_id: taskModelId } : {}),
        },
        select: TASK_INTEGRATION_SELECT,
        orderBy: { referring: "asc" },
      });

      return list;
    } catch (err: unknown) {
      logError("Erro ao listar integrações Regularize", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Não foi possível listar as integrações.", err);
    }
  }
}
