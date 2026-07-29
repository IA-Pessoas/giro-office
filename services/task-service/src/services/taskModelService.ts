import {
  INTEGRACAO_PERMISSION_LEVEL,
  type IntegracaoPermissionLevel,
  error as logError,
  requireIntegracaoRouteAccess,
  ServiceError,
} from "@workspace/shared";
import type { Prisma } from "../generated/prisma/client.js";
import type { TaskModelGetPayload } from "../generated/prisma/models/TaskModel.js";

import * as audit from "../integrations/audit.js";
import prismaClient from "../prisma/index.js";
import { parseTaskModelResponsibleSequence } from "../schemas/taskModelResponsibleSequence.schemas.js";
import { assertResponsibleUsersInDepartment } from "./responsibleUserContext.js";

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
  integracaoLevel?: IntegracaoPermissionLevel;
  isOwner?: boolean;
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
  integracaoLevel?: IntegracaoPermissionLevel;
  isOwner?: boolean;
}

export interface DeleteModelRequest {
  task_id: string;
  user_id: string;
  organization_id?: string | null;
  integracaoLevel?: IntegracaoPermissionLevel;
  isOwner?: boolean;
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

export interface ListTaskModelsParams {
  organizationId: string;
  type?: string;
  billing?: string;
  search: string;
  page: number;
  limit: number;
  paginationRequested: boolean;
  userId: string;
  integracaoLevel?: IntegracaoPermissionLevel;
  isOwner?: boolean;
}

export interface PaginatedTaskModels {
  data: TaskModelListItem[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export class TaskModelService {
  async createModel(data: CreateModelRequest): Promise<{ create: TaskModelRow }> {
    try {
      requireIntegracaoRouteAccess("POST", "/task/model", {
        userId: data.user_id,
        level: data.integracaoLevel ?? INTEGRACAO_PERMISSION_LEVEL.BASIC,
        organizationId: data.organization_id,
        isOwner: data.isOwner === true,
      });

      const responsibleSequence = parseTaskModelResponsibleSequence({
        responsible_id: data.responsible_id,
        responsible2_id: data.responsible2_id ?? null,
        responsible3_id: data.responsible3_id ?? null,
      });
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

      await assertResponsibleUsersInDepartment(prismaClient, data.organization_id, data.department_id, [
        responsibleSequence.responsible_id,
        responsibleSequence.responsible2_id,
        responsibleSequence.responsible3_id,
      ]);

      const create = await prismaClient.taskModel.create({
        data: {
          name: data.name,
          department_id: data.department_id,
          responsible_id: responsibleSequence.responsible_id,
          responsible2_id: responsibleSequence.responsible2_id,
          responsible3_id: responsibleSequence.responsible3_id,
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

  async detailModel(
    taskId: string,
    organizationId: string,
    authorization: {
      userId: string;
      integracaoLevel?: IntegracaoPermissionLevel;
      isOwner?: boolean;
    } = { userId: "" },
  ): Promise<{ detail: TaskModelRow }> {
    try {
      const detail = await prismaClient.taskModel.findFirst({
        where: { id: taskId, organization_id: organizationId },
        select: TASK_MODEL_SELECT,
      });

      if (!detail) {
        throw new ServiceError(404, "Tarefa não encontrada.");
      }

      requireIntegracaoRouteAccess("GET", "/task/model", {
        userId: authorization.userId,
        level: authorization.integracaoLevel ?? INTEGRACAO_PERMISSION_LEVEL.BASIC,
        organizationId,
        resourceOrganizationId: organizationId,
        isOwner: authorization.isOwner === true,
      });

      return { detail };
    } catch (err: unknown) {
      logError("Erro ao buscar modelo de tarefa", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Não foi possível buscar o modelo de tarefa.", err);
    }
  }

  async updateModel(data: UpdateModelRequest): Promise<TaskModelRow> {
    try {
      const responsibleSequence = parseTaskModelResponsibleSequence({
        responsible_id: data.responsible_id,
        responsible2_id: data.responsible2_id ?? null,
        responsible3_id: data.responsible3_id ?? null,
      });
      const organizationId = data.organization_id ?? "";
      const exists = await prismaClient.taskModel.findFirst({
        where: { id: data.task_id, organization_id: organizationId },
      });

      if (!exists) {
        throw new ServiceError(404, "Tarefa não existe.");
      }

      requireIntegracaoRouteAccess("PUT", "/task/model", {
        userId: data.user_id,
        level: data.integracaoLevel ?? INTEGRACAO_PERMISSION_LEVEL.BASIC,
        organizationId,
        resourceOrganizationId: organizationId,
        isOwner: data.isOwner === true,
        requestedFields: [
          "name",
          "department_id",
          "responsible_id",
          "responsible2_id",
          "responsible3_id",
          "observations",
          "billing",
          "prevision",
          "type",
        ],
      });

      await assertResponsibleUsersInDepartment(prismaClient, organizationId, data.department_id, [
        responsibleSequence.responsible_id,
        responsibleSequence.responsible2_id,
        responsibleSequence.responsible3_id,
      ]);

      const updated = await prismaClient.taskModel.update({
        where: { id: data.task_id, organization_id: organizationId },
        data: {
          name: data.name,
          department_id: data.department_id,
          responsible_id: responsibleSequence.responsible_id,
          responsible2_id: responsibleSequence.responsible2_id,
          responsible3_id: responsibleSequence.responsible3_id,
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
    params: ListTaskModelsParams,
  ): Promise<TaskModelListItem[] | PaginatedTaskModels> {
    try {
      requireIntegracaoRouteAccess("GET", "/task/model/list", {
        userId: params.userId,
        level: params.integracaoLevel ?? INTEGRACAO_PERMISSION_LEVEL.BASIC,
        organizationId: params.organizationId,
        isOwner: params.isOwner === true,
      });

      const where: Prisma.TaskModelWhereInput = {
        organization_id: params.organizationId,
        ...(params.type ? { type: params.type } : {}),
        ...(params.billing ? { billing: params.billing } : {}),
        ...(params.search
          ? {
              OR: [
                { name: { contains: params.search, mode: "insensitive" } },
                {
                  department: {
                    name: { contains: params.search, mode: "insensitive" },
                  },
                },
              ],
            }
          : {}),
      };
      const findManyArgs = {
        where,
        select: TASK_MODEL_LIST_SELECT,
        orderBy: { name: "asc" as const },
        ...(params.paginationRequested
          ? { skip: (params.page - 1) * params.limit, take: params.limit }
          : {}),
      };

      if (!params.paginationRequested) {
        return prismaClient.taskModel.findMany(findManyArgs);
      }

      const [list, total] = await Promise.all([
        prismaClient.taskModel.findMany(findManyArgs),
        prismaClient.taskModel.count({ where }),
      ]);

      return {
        data: list,
        total,
        page: params.page,
        limit: params.limit,
        hasMore: params.page * params.limit < total,
      };
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

      requireIntegracaoRouteAccess("DELETE", "/task/model", {
        userId: data.user_id,
        level: data.integracaoLevel ?? INTEGRACAO_PERMISSION_LEVEL.BASIC,
        organizationId,
        resourceOrganizationId: organizationId,
        isOwner: data.isOwner === true,
      });

      try {
        await prismaClient.taskModel.delete({
          where: { id: data.task_id, organization_id: organizationId },
        });
      } catch (err: unknown) {
        logError("Erro ao excluir modelo de tarefa no banco", { err });
        if (typeof err === "object" && err !== null && "code" in err && err.code === "P2003") {
          throw new ServiceError(
            409,
            "Não é possível excluir o modelo enquanto houver dependências.",
          );
        }
        throw err;
      }

      await audit.createLog({
        userId: data.user_id,
        organizationId: data.organization_id,
        action: "Exclusão",
        referring: "integracao.tasksModel",
        referringId: data.task_id,
        changes: "{}",
      });

      return { response: true };
    } catch (err: unknown) {
      logError("Erro ao excluir modelo de tarefa", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Não foi possível excluir o modelo de tarefa.", err);
    }
  }
}
