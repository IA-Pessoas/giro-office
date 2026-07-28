import {
  INTEGRACAO_PERMISSION_LEVEL,
  type IntegracaoPermissionLevel,
  error as logError,
  requireIntegracaoRouteAccess,
  ServiceError,
} from "@workspace/shared";
import type { IntegracaoTaskStatus, TaskBilling } from "../constants/integracaoTask.js";
import type { ProspectingStatus } from "../constants/prospectingStatus.js";
import type { Prisma } from "../generated/prisma/client.js";
import type { TaskGetPayload } from "../generated/prisma/models/Task.js";
import * as audit from "../integrations/audit.js";
import prismaClient from "../prisma/index.js";
import { TaskWorkflowService } from "./taskWorkflowService.js";

const TASK_DETAIL_SELECT = {
  id: true,
  organization_id: true,
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

const ACTIVE_TASK_STATUSES = ["Em Andamento", "A Realizar", "Em Espera"];

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
  name?: string;
  status?: IntegracaoTaskStatus;
  department_id?: string;
  observations: string;
  billing?: TaskBilling;
  urgency: string;
  responsible_id?: string;
  responsible2_id?: string | null;
  responsible3_id?: string | null;
  prevision_date?: Date | string | null;
  integracaoLevel?: IntegracaoPermissionLevel;
  isOwner?: boolean;
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
  integracaoLevel?: IntegracaoPermissionLevel;
  isOwner?: boolean;
}

export interface DeleteTaskCrudRequest {
  task_id: string;
  user_id: string;
  organization_id: string;
  integracaoLevel?: IntegracaoPermissionLevel;
  isOwner?: boolean;
}

export interface ListTaskCrudParams {
  user_id: string;
  organization_id: string;
  status: string;
  ref: string;
  ref_id: string;
  search: string;
  page: number;
  limit: number;
  integracaoLevel?: IntegracaoPermissionLevel;
  isOwner?: boolean;
}

function taskAuthorization(data: {
  user_id: string;
  organization_id: string;
  integracaoLevel?: IntegracaoPermissionLevel;
  isOwner?: boolean;
}) {
  return {
    userId: data.user_id,
    level: data.integracaoLevel ?? INTEGRACAO_PERMISSION_LEVEL.BASIC,
    organizationId: data.organization_id,
    isOwner: data.isOwner === true,
  };
}

export class TaskCrudService {
  readonly #workflow = new TaskWorkflowService();

  async #runTransaction<T>(callback: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    if (typeof prismaClient.$transaction !== "function") {
      return callback(prismaClient as unknown as Prisma.TransactionClient);
    }

    return prismaClient.$transaction(callback);
  }

  /**
   * Cria uma linha em `integracao.tasks` para um modelo dependente (fluxo do legado `createDependent`).
   * Não confundir com `TaskDependentService` (tabela `tasksDependent` entre modelos).
   */
  async #createDependentTaskInstance(params: {
    prisma: Prisma.TransactionClient;
    user_id: string;
    organization_id: string;
    model_id: string;
    status: string;
    project_id: string;
    client_id: string;
    observations: string;
  }): Promise<{ create: TaskCreateRow }> {
    const dup = await params.prisma.task.findFirst({
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

    const model = await params.prisma.taskModel.findFirst({
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

    const create = await params.prisma.task.create({
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

    return { create };
  }

  async createTask(data: CreateTaskCrudRequest): Promise<{ create: TaskCreateRow }> {
    try {
      requireIntegracaoRouteAccess("POST", "/task", taskAuthorization(data));

      const project = await prismaClient.project.findFirst({
        where: { id: data.project_id, organization_id: data.organization_id },
        select: { client_id: true },
      });

      if (!project) {
        throw new ServiceError(404, "Projeto nao encontrado.");
      }

      if (project.client_id !== data.client_id) {
        throw new ServiceError(400, "Projeto nao pertence ao cliente informado.");
      }

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

      const billing = data.billing ?? model.billing;
      let defaultStatus = "A Realizar";
      if (data.prospecting_status === "Fechado") {
        defaultStatus = "Em Andamento";
      }
      if (billing === "Realizar") {
        defaultStatus = "A Realizar";
      }

      const status = data.status ?? defaultStatus;
      const charge_comercial = billing !== "Não Realizar" && status !== "Em Espera";
      const previsionDate =
        data.prevision_date === undefined || data.prevision_date === null
          ? null
          : typeof data.prevision_date === "string"
            ? new Date(`${data.prevision_date}T00:00:00.000Z`)
            : data.prevision_date;

      const { create, dependentCreates } = await this.#runTransaction(async (tx) => {
        const create = await tx.task.create({
          data: {
            organization_id: data.organization_id,
            model_id: data.model_id,
            project_id: data.project_id,
            client_id: data.client_id,
            name: data.name ?? model.name,
            status,
            department_id: data.department_id ?? model.department_id,
            observations: data.observations,
            billing,
            urgency: data.urgency,
            responsible_id: data.responsible_id ?? model.responsible_id,
            responsible2_id: data.responsible2_id ?? model.responsible2_id,
            responsible3_id: data.responsible3_id ?? model.responsible3_id,
            start_date: status === "Em Andamento" ? new Date() : null,
            prevision_date: previsionDate,
            pending_approval: false,
            charge_comercial,
            charge_financeiro: false,
          },
          select: TASK_CREATE_SELECT,
        });

        const dependents = await tx.taskDependent.findMany({
          where: {
            task_id: data.model_id,
            organization_id: data.organization_id,
          },
          select: DEPENDENTS_FOR_CREATE_SELECT,
        });

        const dependentCreates = await Promise.all(
          dependents.map((dep: (typeof dependents)[number]) => {
            let statusDependent =
              data.prospecting_status === "Fechado" ? "Em Andamento" : "A Realizar";
            statusDependent = dep.wait === false ? statusDependent : "Em Espera";

            return this.#createDependentTaskInstance({
              prisma: tx,
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

        return { create, dependentCreates };
      });

      await audit.createLog({
        userId: data.user_id,
        organizationId: data.organization_id,
        action: "Cadastro",
        referring: "integracao.tasks",
        referringId: create.id,
        changes: "{}",
      });

      await Promise.all(
        dependentCreates.map(({ create: dependentCreate }) =>
          audit.createLog({
            userId: data.user_id,
            organizationId: data.organization_id,
            action: "Cadastro",
            referring: "integracao.tasks",
            referringId: dependentCreate.id,
            changes: "{}",
          }),
        ),
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

  async detailTask(
    taskId: string,
    organizationId: string,
    authorization: {
      user_id: string;
      integracaoLevel?: IntegracaoPermissionLevel;
      isOwner?: boolean;
    } = { user_id: "" },
  ): Promise<{ detail: TaskDetailRow }> {
    try {
      const detail = await prismaClient.task.findFirst({
        where: { id: taskId, organization_id: organizationId },
        select: TASK_DETAIL_SELECT,
      });

      if (!detail) {
        throw new ServiceError(404, "Tarefa não encontrada.");
      }

      requireIntegracaoRouteAccess("GET", "/task", {
        userId: authorization.user_id,
        level: authorization.integracaoLevel ?? INTEGRACAO_PERMISSION_LEVEL.BASIC,
        organizationId,
        resourceOrganizationId: detail.organization_id,
        responsibleId: detail.responsible_id,
        responsible2Id: detail.responsible2_id,
        responsible3Id: detail.responsible3_id,
        isOwner: authorization.isOwner === true,
      });

      return { detail };
    } catch (err: unknown) {
      logError("Erro ao buscar tarefa", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Não foi possível buscar a tarefa.", err);
    }
  }

  async listTasks(params: ListTaskCrudParams): Promise<{
    data: TaskListRow[];
    total: number;
    hasMore: boolean;
    summary: {
      inProgress: number;
      billable: number;
    };
  }> {
    try {
      requireIntegracaoRouteAccess("GET", "/task/list", {
        userId: params.user_id,
        level: params.integracaoLevel ?? INTEGRACAO_PERMISSION_LEVEL.BASIC,
        organizationId: params.organization_id,
        responsibleId: params.user_id,
        isOwner: params.isOwner === true,
      });

      const skip = (params.page - 1) * params.limit;
      const where: Prisma.TaskWhereInput = {
        organization_id: params.organization_id,
      };
      const isBasicAccess =
        (params.integracaoLevel ?? INTEGRACAO_PERMISSION_LEVEL.BASIC) ===
          INTEGRACAO_PERMISSION_LEVEL.BASIC && params.isOwner !== true;
      const andFilters: Prisma.TaskWhereInput[] = [];

      if (isBasicAccess) {
        andFilters.push({ status: { in: ACTIVE_TASK_STATUSES } });
      }

      const responsibleFilter: Prisma.TaskWhereInput[] | undefined = isBasicAccess
        ? [
            { responsible_id: params.user_id },
            { responsible2_id: params.user_id },
            { responsible3_id: params.user_id },
          ]
        : undefined;

      if (params.status !== "Todos") {
        if (isBasicAccess) {
          andFilters.push({ status: params.status });
        } else {
          where.status = params.status;
        }
      }

      if (params.ref === "CobrançaComercial") {
        where.charge_comercial = true;
      } else if (params.ref === "CobrançaFinanceiro") {
        where.charge_financeiro = true;
      }

      if (params.search) {
        const searchFilter: Prisma.TaskWhereInput = {
          name: { contains: params.search, mode: "insensitive" },
        };
        if (responsibleFilter) {
          andFilters.push({ OR: responsibleFilter }, { OR: [searchFilter] });
        } else {
          where.OR = [searchFilter];
        }
      } else if (responsibleFilter) {
        andFilters.push({ OR: responsibleFilter });
      }

      if (andFilters.length > 0) {
        where.AND = andFilters;
      }

      const [list, total, inProgress, billable] = await Promise.all([
        prismaClient.task.findMany({
          where,
          select: TASK_LIST_SELECT,
          skip,
          take: params.limit,
          orderBy: { name: "asc" },
        }),
        prismaClient.task.count({ where }),
        prismaClient.task.count({
          where: {
            AND: [where, { status: { contains: "andamento", mode: "insensitive" } }],
          },
        }),
        prismaClient.task.count({
          where: {
            AND: [where, { NOT: { billing: { contains: "não", mode: "insensitive" } } }],
          },
        }),
      ]);

      const hasMore = params.page * params.limit < total;

      return {
        data: list,
        total,
        hasMore,
        summary: { inProgress, billable },
      };
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

      requireIntegracaoRouteAccess("PUT", "/task", {
        userId: data.user_id,
        level: data.integracaoLevel ?? INTEGRACAO_PERMISSION_LEVEL.BASIC,
        organizationId: data.organization_id,
        resourceOrganizationId: exists.organization_id,
        responsibleId: exists.responsible_id,
        responsible2Id: exists.responsible2_id,
        responsible3Id: exists.responsible3_id,
        isOwner: data.isOwner === true,
        requestedFields: Object.keys(data).filter(
          (field) =>
            !["user_id", "organization_id", "task_id", "integracaoLevel", "isOwner"].includes(
              field,
            ),
        ),
      });

      const canSetCompletedStatus =
        data.isOwner === true ||
        (data.integracaoLevel ?? INTEGRACAO_PERMISSION_LEVEL.BASIC) >=
          INTEGRACAO_PERMISSION_LEVEL.ADMIN;
      if (data.status === "Concluída" && !canSetCompletedStatus) {
        throw new ServiceError(
          403,
          "A conclusão deve ser solicitada pelo fluxo de conclusão da tarefa.",
        );
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

      requireIntegracaoRouteAccess("DELETE", "/task", {
        userId: data.user_id,
        level: data.integracaoLevel ?? INTEGRACAO_PERMISSION_LEVEL.BASIC,
        organizationId: data.organization_id,
        resourceOrganizationId: exists.organization_id,
        isOwner: data.isOwner === true,
      });

      try {
        await prismaClient.task.delete({
          where: { id: data.task_id },
        });
      } catch (err: unknown) {
        logError("Erro ao excluir tarefa no banco", { err });
        if (typeof err === "object" && err !== null && "code" in err && err.code === "P2003") {
          throw new ServiceError(
            409,
            "Não é possível excluir a tarefa enquanto houver dependências.",
          );
        }
        throw err;
      }

      await audit.createLog({
        userId: data.user_id,
        organizationId: data.organization_id,
        action: "Exclusão",
        referring: "integracao.tasks",
        referringId: data.task_id,
        changes: "{}",
      });

      return { deleted: true };
    } catch (err: unknown) {
      logError("Erro ao excluir tarefa", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Não foi possível excluir a tarefa.", err);
    }
  }
}
