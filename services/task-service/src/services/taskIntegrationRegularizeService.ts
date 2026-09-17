import {
  type IntegracaoPermissionLevel,
  error as logError,
  requireIntegracaoRouteAccess,
  ServiceError,
} from "@workspace/shared";
import type { TasksIntegrationRegularizeGetPayload } from "../generated/prisma/models/TasksIntegrationRegularize.js";

import * as audit from "../integrations/audit.js";
import prismaClient from "../prisma/index.js";

export interface CreateLinkRequest {
  user_id: string;
  organization_id: string;
  task_model_id: string;
  referring: string;
  referring_type: string;
  integracaoLevel: IntegracaoPermissionLevel;
  isOwner?: boolean;
}

export interface RemoveLinkRequest {
  user_id: string;
  organization_id: string;
  integration_id: string;
  integracaoLevel: IntegracaoPermissionLevel;
  isOwner?: boolean;
}

const REGULARIZE_LINK_TYPES = ["process", "license"] as const;
type RegularizeLinkType = (typeof REGULARIZE_LINK_TYPES)[number];

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

export type TaskIntegrationRegularizeListRow = TaskIntegrationRegularizeRow & {
  available: boolean;
};

function isRegularizeLinkType(value: string): value is RegularizeLinkType {
  return REGULARIZE_LINK_TYPES.includes(value as RegularizeLinkType);
}

function isUniqueConstraintError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && err.code === "P2002";
}

export class TaskIntegrationRegularizeService {
  async createLink(
    data: CreateLinkRequest,
  ): Promise<{ integration: TaskIntegrationRegularizeRow }> {
    try {
      const taskModel = await prismaClient.taskModel.findFirst({
        where: { id: data.task_model_id, organization_id: data.organization_id },
        select: { name: true },
      });

      if (!taskModel) {
        throw new ServiceError(404, "Modelo de Tarefa não encontrado.");
      }
      requireIntegracaoRouteAccess("POST", "/task/integration", {
        userId: data.user_id,
        level: data.integracaoLevel,
        organizationId: data.organization_id,
        resourceOrganizationId: data.organization_id,
        isOwner: data.isOwner === true,
      });

      if (!isRegularizeLinkType(data.referring_type)) {
        throw new ServiceError(400, "referring_type deve ser process ou license.");
      }

      const destination = await (data.referring_type === "process"
        ? prismaClient.process.findFirst({
            where: { id: data.referring, organization_id: data.organization_id },
            select: { id: true },
          })
        : prismaClient.license.findFirst({
            where: { id: data.referring, organization_id: data.organization_id },
            select: { id: true },
          }));
      if (!destination) {
        throw new ServiceError(404, "Destino Regularize não encontrado.");
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
        required: true,
      });

      return { integration };
    } catch (err: unknown) {
      logError("Erro ao vincular integração Regularize", { err });
      if (err instanceof ServiceError) throw err;
      if (isUniqueConstraintError(err)) {
        throw new ServiceError(
          409,
          "Este tipo de serviço já está vinculado a este modelo de tarefa.",
          err,
        );
      }
      throw new ServiceError(500, "Não foi possível vincular a integração.", err);
    }
  }

  async removeLink(data: RemoveLinkRequest): Promise<{ message: string }> {
    try {
      requireIntegracaoRouteAccess("DELETE", "/task/integration", {
        userId: data.user_id,
        level: data.integracaoLevel,
        organizationId: data.organization_id,
        resourceOrganizationId: data.organization_id,
        isOwner: data.isOwner === true,
      });
      const existing = await prismaClient.tasksIntegrationRegularize.findFirst({
        where: { id: data.integration_id, organization_id: data.organization_id },
        select: { task_model_id: true, referring: true, referring_type: true },
      });
      const deleted = existing
        ? await prismaClient.tasksIntegrationRegularize.deleteMany({
            where: { id: data.integration_id, organization_id: data.organization_id },
          })
        : { count: 0 };

      if (deleted.count === 0) {
        throw new ServiceError(404, "Vínculo não encontrado.");
      }

      await audit.createLog({
        userId: data.user_id,
        organizationId: data.organization_id,
        action: "Desvincular Tarefa",
        referring: "integracao.tasks",
        referringId: data.integration_id,
        changes: {
          task_model_id: existing?.task_model_id,
          referring: existing?.referring,
          referring_type: existing?.referring_type,
        },
        required: true,
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
    taskModelId: string | undefined,
    access: { userId: string; integracaoLevel: IntegracaoPermissionLevel; isOwner?: boolean },
  ): Promise<TaskIntegrationRegularizeListRow[]> {
    try {
      requireIntegracaoRouteAccess("GET", "/task/integration", {
        userId: access.userId,
        level: access.integracaoLevel,
        organizationId,
        resourceOrganizationId: organizationId,
        isOwner: access.isOwner === true,
      });
      if (taskModelId) {
        const taskModel = await prismaClient.taskModel.findFirst({
          where: { id: taskModelId, organization_id: organizationId },
          select: { id: true },
        });
        if (!taskModel) {
          throw new ServiceError(404, "Modelo de Tarefa não encontrado.");
        }
      }
      const list = await prismaClient.tasksIntegrationRegularize.findMany({
        where: {
          organization_id: organizationId,
          ...(taskModelId ? { task_model_id: taskModelId } : {}),
        },
        select: TASK_INTEGRATION_SELECT,
        orderBy: { referring: "asc" },
      });

      const processIds = list
        .filter((link) => link.referring_type === "process")
        .map((link) => link.referring);
      const licenseIds = list
        .filter((link) => link.referring_type === "license")
        .map((link) => link.referring);
      const [processes, licenses] = await Promise.all([
        processIds.length
          ? prismaClient.process.findMany({
              where: { organization_id: organizationId, id: { in: processIds } },
              select: { id: true },
            })
          : [],
        licenseIds.length
          ? prismaClient.license.findMany({
              where: { organization_id: organizationId, id: { in: licenseIds } },
              select: { id: true },
            })
          : [],
      ]);
      const availableProcessIds = new Set(processes.map(({ id }) => id));
      const availableLicenseIds = new Set(licenses.map(({ id }) => id));
      return list.map((link) => ({
        ...link,
        available:
          link.referring_type === "process"
            ? availableProcessIds.has(link.referring)
            : link.referring_type === "license" && availableLicenseIds.has(link.referring),
      }));
    } catch (err: unknown) {
      logError("Erro ao listar integrações Regularize", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Não foi possível listar as integrações.", err);
    }
  }
}
