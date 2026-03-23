import { error as logError, ServiceError } from "@workspace/shared";

import * as audit from "../integrations/audit.js";
import prismaClient from "../prisma/index.js";

export interface AddDependentRequest {
  user_id: string;
  organization_id: string;
  task_model_id: string;
  dependent_id: string;
  wait: boolean;
  observation: string;
}

export interface DeleteDependentRequest {
  id: string;
  user_id: string;
  organization_id: string;
}

const TASK_DEPENDENT_SELECT = {
  id: true,
  task_id: true,
  dependent_id: true,
  wait: true,
  observation: true,
  dependent: {
    select: { id: true, name: true },
  },
} as const;

export class TaskDependentService {
  async addDependent(data: AddDependentRequest) {
    try {
      if (data.task_model_id === data.dependent_id) {
        throw new ServiceError(400, "Uma tarefa não pode depender de si mesma.");
      }

      const taskModel = await prismaClient.taskModel.findFirst({
        where: { id: data.task_model_id, organization_id: data.organization_id },
      });

      if (!taskModel) {
        throw new ServiceError(404, "Tarefa modelo não encontrada.");
      }

      const dependentModel = await prismaClient.taskModel.findFirst({
        where: { id: data.dependent_id, organization_id: data.organization_id },
      });

      if (!dependentModel) {
        throw new ServiceError(404, "Tarefa dependente não encontrada.");
      }

      const alreadyExists = await prismaClient.taskDependent.findFirst({
        where: {
          task_id: data.task_model_id,
          dependent_id: data.dependent_id,
          organization_id: data.organization_id,
        },
      });

      if (alreadyExists) {
        throw new ServiceError(409, "Essa dependência já está cadastrada.");
      }

      const created = await prismaClient.taskDependent.create({
        data: {
          task_id: data.task_model_id,
          dependent_id: data.dependent_id,
          wait: data.wait,
          observation: data.observation,
          organization_id: data.organization_id,
        },
        select: TASK_DEPENDENT_SELECT,
      });

      await audit.createLog({
        userId: data.user_id,
        organizationId: data.organization_id,
        action: "Cadastro",
        referring: "integracao.tasksDependent",
        referringId: created.id,
        changes: "{}",
      });

      return { created };
    } catch (err: unknown) {
      logError("Erro ao adicionar dependente", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Não foi possível adicionar o dependente.", err);
    }
  }

  async listDependents(taskModelId: string, organizationId: string) {
    try {
      const list = await prismaClient.taskDependent.findMany({
        where: {
          task_id: taskModelId,
          organization_id: organizationId,
        },
        select: TASK_DEPENDENT_SELECT,
      });

      return list;
    } catch (err: unknown) {
      logError("Erro ao listar dependentes", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Não foi possível listar os dependentes.", err);
    }
  }

  async deleteDependent(data: DeleteDependentRequest) {
    try {
      const exists = await prismaClient.taskDependent.findFirst({
        where: { id: data.id, organization_id: data.organization_id },
      });

      if (!exists) {
        throw new ServiceError(404, "Dependência não encontrada.");
      }

      const deleted = await prismaClient.taskDependent.deleteMany({
        where: { id: data.id, organization_id: data.organization_id },
      });

      if (deleted.count === 0) {
        throw new ServiceError(404, "Dependência não encontrada.");
      }

      await audit.createLog({
        userId: data.user_id,
        organizationId: data.organization_id,
        action: "Exclusão",
        referring: "integracao.tasksDependent",
        referringId: data.id,
        changes: JSON.stringify({
          task_id: exists.task_id,
          dependent_id: exists.dependent_id,
        }),
      });

      return { deleted: true };
    } catch (err: unknown) {
      logError("Erro ao excluir dependente", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Não foi possível excluir o dependente.", err);
    }
  }
}
