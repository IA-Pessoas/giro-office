import { error as logError, ServiceError } from "@workspace/shared";
import type { IntegracaoTaskStatus, TaskBilling } from "../constants/integracaoTask.js";
import type { ProspectingStatus } from "../constants/prospectingStatus.js";
import type { TaskGetPayload } from "../generated/prisma/models/Task.js";
import * as audit from "../integrations/audit.js";
import prismaClient from "../prisma/index.js";
import { TaskWorkflowService } from "./taskWorkflowService.js";

const TASK_DETAIL_SELECT = {
  id: true,
  model_id: true,
  project_id: true,
  client_id: true,
  name: true,
  status: true,
  department_id: true,
  observations: true,
  billing: true,
  urgency: true,
  responsible_id: true,
  responsible2_id: true,
  responsible3_id: true,
  start_date: true,
  prevision_date: true,
  end_date: true,
  date_created: true,
  date_updated: true,
} as const;

const TASK_CREATE_SELECT = {
  id: true,
  model_id: true,
  project_id: true,
  client_id: true,
  name: true,
  status: true,
  department_id: true,
  observations: true,
  billing: true,
  urgency: true,
  responsible_id: true,
  responsible2_id: true,
  responsible3_id: true,
  start_date: true,
  charge_comercial: true,
  charge_financeiro: true,
} as const;

const TASK_LIST_SELECT = {
  id: true,
  name: true,
  status: true,
  billing: true,
  charge_comercial: true,
  hiring_status: true,
  payment: true,
  billing_description: true,
  charge_financeiro: true,
} as const;

const TASK_UPDATE_SELECT = {
  name: true,
  status: true,
  department_id: true,
  observations: true,
  billing: true,
  urgency: true,
  responsible_id: true,
  responsible2_id: true,
  responsible3_id: true,
  prevision_date: true,
} as const;

const DEPENDENTS_FOR_CREATE_SELECT = {
  dependent_id: true,
  wait: true,
  observation: true,
} as const;

export type TaskDetailRow = TaskGetPayload<{ select: typeof TASK_DETAIL_SELECT }>;
export type TaskCreateRow = TaskGetPayload<{ select: typeof TASK_CREATE_SELECT }>;
export type TaskListRow = TaskGetPayload<{ select: typeof TASK_LIST_SELECT }>;

export type { IntegracaoTaskStatus, TaskBilling } from "../constants/integracaoTask.js";
export { INTEGRACAO_TASK_STATUS_VALUES } from "../constants/integracaoTask.js";
export type { ProspectingStatus } from "../constants/prospectingStatus.js";
export { PROSPECTING_STATUS_VALUES } from "../constants/prospectingStatus.js";

export interface CreateTaskCrudRequest {
  user_id: string;
  organization_id: string;
  model_id: string;
  project_id: string;
  client_id: string;
  prospecting_status: ProspectingStatus;
  observations: string;
  urgency: string;
}

/** PUT parcial: só `task_id` é obrigatório; demais campos fazem merge com a tarefa existente. */
export interface UpdateTaskCrudRequest {
  user_id: string;
  organization_id: string;
  task_id: string;
  name?: string;
  status?: IntegracaoTaskStatus;
  department_id?: string;
  observations?: string;
  billing?: TaskBilling;
  urgency?: string;
  responsible_id?: string;
  responsible2_id?: string | null;
  responsible3_id?: string | null;
  prevision_date?: Date | string | null;
}

export interface DeleteTaskCrudRequest {
  task_id: string;
  user_id: string;
  organization_id: string;
}

export interface ListTaskCrudParams {
  organization_id: string;
  status: string;
  ref: string;
  ref_id: string;
  search: string;
  page: number;
  limit: number;
}

export class TaskCrudService {
  readonly #workflow = new TaskWorkflowService();

  /**
   * Cria uma linha em `integracao.tasks` para um modelo dependente (fluxo do legado `createDependent`).
   * Não confundir com `TaskDependentService` (tabela `tasksDependent` entre modelos).
   */
  async #createDependentTaskInstance(params: {
    user_id: string;
    organization_id: string;
    model_id: string;
    status: string;
    project_id: string;
    client_id: string;
    observations: string;
  }): Promise<{ create: TaskCreateRow }> {
    const dup = await prismaClient.task.findFirst({
      where: {
        organization_id: params.organization_id,
        project_id: params.project_id,
        model_id: params.model_id,
        status: { in: ["Em Andamento", "A Realizar", "Em Espera"] },
      },
    });

    if (dup) {
      throw new ServiceError(409, "Tarefa já foi cadastrada.");
    }

    const model = await prismaClient.taskModel.findFirst({
      where: { id: params.model_id, organization_id: params.organization_id },
    });

    if (!model) {
      throw new ServiceError(404, "Tarefa modelo não existe.");
    }

    let charge_comercial = model.billing !== "Não Realizar";
    let charge_financeiro = model.billing !== "Não Realizar";

    if (params.status === "Em Espera") {
      charge_comercial = false;
      charge_financeiro = false;
    }

    const create = await prismaClient.task.create({
      data: {
        organization_id: params.organization_id,
        model_id: params.model_id,
        project_id: params.project_id,
        client_id: params.client_id,
        name: model.name,
        status: params.status,
        department_id: model.department_id,
        observations: params.observations,
        billing: model.billing,
        urgency: "",
        responsible_id: model.responsible_id,
        responsible2_id: model.responsible2_id,
        responsible3_id: model.responsible3_id,
        start_date: params.status === "Em Andamento" ? new Date() : null,
        pending_approval: false,
        charge_comercial,
        charge_financeiro,
      },
      select: TASK_CREATE_SELECT,
    });

    await audit.createLog({
      userId: params.user_id,
      organizationId: params.organization_id,
      action: "Cadastro",
      referring: "integracao.tasks",
      referringId: create.id,
      changes: "{}",
    });

    return { create };
  }

  async createTask(data: CreateTaskCrudRequest): Promise<{ create: TaskCreateRow }> {
    try {
      const dup = await prismaClient.task.findFirst({
        where: {
          organization_id: data.organization_id,
          project_id: data.project_id,
          model_id: data.model_id,
          status: { in: ["Em Andamento", "A Realizar", "Em Espera"] },
        },
      });

      if (dup) {
        throw new ServiceError(409, "Tarefa já foi cadastrada em andamento.");
      }

      const model = await prismaClient.taskModel.findFirst({
        where: { id: data.model_id, organization_id: data.organization_id },
      });

      if (!model) {
        throw new ServiceError(404, "Tarefa modelo não existe.");
      }

      let status = "A Realizar";
      if (data.prospecting_status === "Fechado") {
        status = "Em Andamento";
      }
      if (model.billing === "Realizar") {
        status = "A Realizar";
      }

      const charge_comercial = model.billing !== "Não Realizar";

      const create = await prismaClient.task.create({
        data: {
          organization_id: data.organization_id,
          model_id: data.model_id,
          project_id: data.project_id,
          client_id: data.client_id,
          name: model.name,
          status,
          department_id: model.department_id,
          observations: data.observations,
          billing: model.billing,
          urgency: data.urgency,
          responsible_id: model.responsible_id,
          responsible2_id: model.responsible2_id,
          responsible3_id: model.responsible3_id,
          start_date: status === "Em Andamento" ? new Date() : null,
          pending_approval: false,
          charge_comercial,
          charge_financeiro: false,
        },
        select: TASK_CREATE_SELECT,
      });

      await audit.createLog({
        userId: data.user_id,
        organizationId: data.organization_id,
        action: "Cadastro",
        referring: "integracao.tasks",
        referringId: create.id,
        changes: "{}",
      });

      const dependents = await prismaClient.taskDependent.findMany({
        where: {
          task_id: data.model_id,
          organization_id: data.organization_id,
        },
        select: DEPENDENTS_FOR_CREATE_SELECT,
      });

      await Promise.all(
        dependents.map((dep: (typeof dependents)[number]) => {
          let statusDependent =
            data.prospecting_status === "Fechado" ? "Em Andamento" : "A Realizar";
          statusDependent = dep.wait === false ? statusDependent : "Em Espera";

          return this.#createDependentTaskInstance({
            user_id: data.user_id,
            organization_id: data.organization_id,
            model_id: dep.dependent_id,
            status: statusDependent,
            project_id: data.project_id,
            client_id: data.client_id,
            observations: dep.observation,
          });
        }),
      );

      await this.#workflow.afterTaskCreated({
        projectId: data.project_id,
        userId: data.user_id,
        organizationId: data.organization_id,
      });

      return { create };
    } catch (err: unknown) {
      logError("Erro ao criar tarefa", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Não foi possível criar a tarefa.", err);
    }
  }

  async detailTask(taskId: string, organizationId: string): Promise<{ detail: TaskDetailRow }> {
    try {
      const detail = await prismaClient.task.findFirst({
        where: { id: taskId, organization_id: organizationId },
        select: TASK_DETAIL_SELECT,
      });

      if (!detail) {
        throw new ServiceError(404, "Tarefa não encontrada.");
      }

      return { detail };
    } catch (err: unknown) {
      logError("Erro ao buscar tarefa", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Não foi possível buscar a tarefa.", err);
    }
  }

  async listTasks(params: ListTaskCrudParams): Promise<{
    data: TaskListRow[];
    hasMore: boolean;
  }> {
    try {
      const skip = (params.page - 1) * params.limit;
      const where: {
        organization_id: string;
        status?: string;
        charge_comercial?: boolean;
        charge_financeiro?: boolean;
        OR?: { name: { contains: string; mode: "insensitive" } }[];
      } = {
        organization_id: params.organization_id,
      };

      if (params.status !== "Todos") {
        where.status = params.status;
      }

      if (params.ref === "CobrançaComercial") {
        where.charge_comercial = true;
      } else if (params.ref === "CobrançaFinanceiro") {
        where.charge_financeiro = true;
      }

      if (params.search) {
        where.OR = [{ name: { contains: params.search, mode: "insensitive" } }];
      }

      const [list, total] = await Promise.all([
        prismaClient.task.findMany({
          where,
          select: TASK_LIST_SELECT,
          skip,
          take: params.limit,
          orderBy: { name: "asc" },
        }),
        prismaClient.task.count({ where }),
      ]);

      const hasMore = params.page * params.limit < total;

      return { data: list, hasMore };
    } catch (err: unknown) {
      logError("Erro ao listar tarefas", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Não foi possível listar as tarefas.", err);
    }
  }

  async updateTask(
    data: UpdateTaskCrudRequest,
  ): Promise<TaskGetPayload<{ select: typeof TASK_UPDATE_SELECT }>> {
    try {
      const exists = await prismaClient.task.findFirst({
        where: { id: data.task_id, organization_id: data.organization_id },
      });

      if (!exists) {
        throw new ServiceError(404, "Tarefa não existe.");
      }

      const name = data.name !== undefined ? data.name : exists.name;
      const status = data.status !== undefined ? data.status : exists.status;
      const department_id =
        data.department_id !== undefined ? data.department_id : exists.department_id;
      const observations =
        data.observations !== undefined ? data.observations : exists.observations;
      const billing = data.billing !== undefined ? data.billing : exists.billing;
      const urgency = data.urgency !== undefined ? data.urgency : exists.urgency;
      const responsible_id =
        data.responsible_id !== undefined ? data.responsible_id : exists.responsible_id;
      const responsible2_id =
        data.responsible2_id !== undefined ? data.responsible2_id : exists.responsible2_id;
      const responsible3_id =
        data.responsible3_id !== undefined ? data.responsible3_id : exists.responsible3_id;

      let prevision_date: Date | null;
      if (data.prevision_date === undefined) {
        prevision_date = exists.prevision_date;
      } else if (data.prevision_date === null) {
        prevision_date = null;
      } else {
        prevision_date =
          typeof data.prevision_date === "string"
            ? new Date(data.prevision_date)
            : data.prevision_date;
      }

      const updated = await prismaClient.task.update({
        where: { id: data.task_id },
        data: {
          name,
          status,
          department_id,
          observations,
          billing,
          urgency,
          responsible_id,
          responsible2_id,
          responsible3_id,
          prevision_date,
        },
        select: TASK_UPDATE_SELECT,
      });

      await audit.logUpdateIfChanged({
        userId: data.user_id,
        organizationId: data.organization_id,
        action: "Atualização",
        referring: "integracao.tasks",
        referringId: data.task_id,
        oldData: exists as Record<string, unknown>,
        updatedData: updated as Record<string, unknown>,
      });

      await this.#workflow.afterTaskUpdated({
        taskId: data.task_id,
        projectId: exists.project_id,
        userId: data.user_id,
        organizationId: data.organization_id,
        previousStatus: exists.status ?? "",
        newStatus: status,
        previousBilling: exists.billing ?? "",
      });

      return updated;
    } catch (err: unknown) {
      logError("Erro ao atualizar tarefa", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Não foi possível atualizar a tarefa.", err);
    }
  }

  async deleteTask(data: DeleteTaskCrudRequest): Promise<{ deleted: true }> {
    try {
      const exists = await prismaClient.task.findFirst({
        where: { id: data.task_id, organization_id: data.organization_id },
      });

      if (!exists) {
        throw new ServiceError(404, "Tarefa não existe.");
      }

      const user = await prismaClient.user.findFirst({
        where: { id: data.user_id },
      });

      if (!user) {
        throw new ServiceError(404, "Usuário não encontrado.");
      }

      if (user.permission !== 2) {
        throw new ServiceError(403, "Usuário não tem permissão.");
      }

      await prismaClient.task.delete({
        where: { id: data.task_id },
      });

      return { deleted: true };
    } catch (err: unknown) {
      logError("Erro ao excluir tarefa", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Não foi possível excluir a tarefa.", err);
    }
  }
}
