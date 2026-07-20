import { error as logError, ServiceError } from "@workspace/shared";
import type { TaskModelGetPayload } from "../generated/prisma/models/TaskModel.js";

import * as audit from "../integrations/audit.js";
import prismaClient from "../prisma/index.js";

export interface CreateModelRequest {
  user_id: string;
  organization_id: string;
  name: string;
  department_id: string;
  responsible_id: string;
  responsible2_id?: string | null;
  responsible3_id?: string | null;
  observations?: string | null;
  billing: string;
  prevision: number;
  type?: string | null;
}

export interface UpdateModelRequest {
  user_id: string;
  organization_id?: string | null;
  task_id: string;
  name: string;
  department_id: string;
  responsible_id: string;
  responsible2_id?: string | null;
  responsible3_id?: string | null;
  observations?: string | null;
  billing: string;
  prevision: number;
  type?: string | null;
}

export interface DeleteModelRequest {
  task_id: string;
  user_id: string;
  organization_id?: string | null;
}

const TASK_MODEL_SELECT = {
  id: true,
  name: true,
  department_id: true,
  responsible_id: true,
  responsible2_id: true,
  responsible3_id: true,
  observations: true,
  billing: true,
  prevision: true,
  type: true,
} as const;

const TASK_MODEL_LIST_SELECT = {
  id: true,
  name: true,
  department_id: true,
  department: {
    select: {
      id: true,
      name: true,
    },
  },
} as const;

export type TaskModelRow = TaskModelGetPayload<{ select: typeof TASK_MODEL_SELECT }>;
export type TaskModelListItem = TaskModelGetPayload<{ select: typeof TASK_MODEL_LIST_SELECT }>;

export class TaskModelService {
  async #requireManagerPermission(userId: string): Promise<void> {
    const user = await prismaClient.user.findFirst({
      where: { id: userId },
    });

    if (!user) {
      throw new ServiceError(404, "Usuário não encontrado.");
    }

    if (user.permission < 2) {
      throw new ServiceError(403, "Usuário não tem permissão.");
    }
  }

  async createModel(data: CreateModelRequest): Promise<{ create: TaskModelRow }> {
    try {
      const exists = await prismaClient.taskModel.findFirst({
        where: {
          name: data.name,
          department_id: data.department_id,
          organization_id: data.organization_id,
        },
      });

      if (exists) {
        throw new ServiceError(409, "Tarefa com esse nome nesse departamento já foi cadastrada.");
      }

      await this.#requireManagerPermission(data.user_id);

      const create = await prismaClient.taskModel.create({
        data: {
          name: data.name,
          department_id: data.department_id,
          responsible_id: data.responsible_id,
          responsible2_id: data.responsible2_id ?? null,
          responsible3_id: data.responsible3_id ?? null,
          observations: data.observations ?? null,
          billing: data.billing,
          prevision: data.prevision,
          type: data.type ?? null,
          organization_id: data.organization_id,
        },
        select: TASK_MODEL_SELECT,
      });

      await audit.createLog({
        userId: data.user_id,
        organizationId: data.organization_id,
        action: "Cadastro",
        referring: "integracao.tasksModel",
        referringId: create.id,
        changes: "{}",
      });

      return { create };
    } catch (err: unknown) {
      logError("Erro ao cadastrar modelo de tarefa", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Não foi possível cadastrar o modelo de tarefa.", err);
    }
  }

  async detailModel(taskId: string, organizationId: string): Promise<{ detail: TaskModelRow }> {
    try {
      const detail = await prismaClient.taskModel.findFirst({
        where: { id: taskId, organization_id: organizationId },
        select: TASK_MODEL_SELECT,
      });

      if (!detail) {
        throw new ServiceError(404, "Tarefa não encontrada.");
      }

      return { detail };
    } catch (err: unknown) {
      logError("Erro ao buscar modelo de tarefa", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Não foi possível buscar o modelo de tarefa.", err);
    }
  }

  async updateModel(data: UpdateModelRequest): Promise<TaskModelRow> {
    try {
      const organizationId = data.organization_id ?? "";
      const exists = await prismaClient.taskModel.findFirst({
        where: { id: data.task_id, organization_id: organizationId },
      });

      if (!exists) {
        throw new ServiceError(404, "Tarefa não existe.");
      }

      await this.#requireManagerPermission(data.user_id);

      const updated = await prismaClient.taskModel.update({
        where: { id: data.task_id, organization_id: organizationId },
        data: {
          name: data.name,
          department_id: data.department_id,
          responsible_id: data.responsible_id,
          responsible2_id: data.responsible2_id ?? null,
          responsible3_id: data.responsible3_id ?? null,
          observations: data.observations ?? null,
          billing: data.billing,
          prevision: data.prevision,
          type: data.type ?? null,
        },
        select: TASK_MODEL_SELECT,
      });

      await audit.logUpdateIfChanged({
        userId: data.user_id,
        organizationId: data.organization_id,
        action: "Atualização",
        referring: "integracao.tasksModel",
        referringId: data.task_id,
        oldData: exists as Record<string, unknown>,
        updatedData: updated as Record<string, unknown>,
      });

      return updated;
    } catch (err: unknown) {
      logError("Erro ao atualizar modelo de tarefa", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Não foi possível atualizar o modelo de tarefa.", err);
    }
  }

  async listModel(
    type: string | undefined,
    billing: string | undefined,
    organizationId: string,
  ): Promise<TaskModelListItem[]> {
    try {
      const list = await prismaClient.taskModel.findMany({
        where: {
          organization_id: organizationId,
          ...(type ? { type } : {}),
          ...(billing ? { billing } : {}),
        },
        select: TASK_MODEL_LIST_SELECT,
        orderBy: { name: "asc" },
      });

      return list;
    } catch (err: unknown) {
      logError("Erro ao listar modelos de tarefa", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Não foi possível listar os modelos de tarefa.", err);
    }
  }

  async deleteModel(data: DeleteModelRequest): Promise<{ response: true }> {
    try {
      const organizationId = data.organization_id ?? "";
      const exists = await prismaClient.taskModel.findFirst({
        where: { id: data.task_id, organization_id: organizationId },
      });

      if (!exists) {
        throw new ServiceError(404, "Tarefa não existe.");
      }

      await this.#requireManagerPermission(data.user_id);

      await prismaClient.taskModel.delete({
        where: { id: data.task_id, organization_id: organizationId },
      });

      return { response: true };
    } catch (err: unknown) {
      logError("Erro ao excluir modelo de tarefa", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Não foi possível excluir o modelo de tarefa.", err);
    }
  }
}
