import { error as logError, ServiceError } from "@workspace/shared";
import type { ProjectPlanGetPayload } from "../generated/prisma/models/ProjectPlan.js";
import type { ProjectPlanTasksGetPayload } from "../generated/prisma/models/ProjectPlanTasks.js";
import type * as Prisma from "../generated/prisma/internal/prismaNamespace.js";
import type { ProspectingStatus } from "../constants/prospectingStatus.js";
import * as audit from "../integrations/audit.js";
import prismaClient from "../prisma/index.js";
import { TaskCrudService, type TaskCreateRow } from "./TaskCrudService.js";

const PROJECT_PLAN_SELECT = {
  id: true,
  name: true,
  color: true,
} as const;

const PROJECT_PLAN_TASK_MODEL_SELECT = {
  id: true,
  name: true,
  department_id: true,
  billing: true,
  prevision: true,
  type: true,
} as const;

const PROJECT_PLAN_TASK_SELECT = {
  id: true,
  plan_id: true,
  task_id: true,
  order: true,
  tasks: {
    select: PROJECT_PLAN_TASK_MODEL_SELECT,
  },
} as const;

const PROJECT_PLAN_DETAIL_SELECT = {
  id: true,
  name: true,
  color: true,
  tasks: {
    select: PROJECT_PLAN_TASK_SELECT,
    orderBy: {
      order: "asc",
    },
  },
} as const;

export type ProjectPlanRow = ProjectPlanGetPayload<{ select: typeof PROJECT_PLAN_SELECT }>;
export type ProjectPlanDetailRow = ProjectPlanGetPayload<{ select: typeof PROJECT_PLAN_DETAIL_SELECT }>;
export type ProjectPlanTaskRow = ProjectPlanTasksGetPayload<{ select: typeof PROJECT_PLAN_TASK_SELECT }>;

export interface CreateProjectPlanRequest {
  user_id: string;
  organization_id: string;
  name: string;
  color: string;
}

export interface UpdateProjectPlanRequest extends CreateProjectPlanRequest {
  id: string;
}

export interface DeleteProjectPlanRequest {
  id: string;
  user_id: string;
  organization_id: string;
}

export interface AddProjectPlanTaskRequest {
  plan_id: string;
  task_id: string;
  user_id: string;
  organization_id: string;
}

export interface ReorderProjectPlanTaskRequest {
  plan_id: string;
  plan_task_id: string;
  direction: "up" | "down";
  organization_id: string;
}

export interface DeleteProjectPlanTaskRequest {
  plan_id: string;
  plan_task_id: string;
  organization_id: string;
}

export interface HireProjectPlanRequest {
  user_id: string;
  organization_id: string;
  project_id: string;
  plan_id: string;
}

export interface ProjectPlanPrisma {
  projectPlan: Pick<
    typeof prismaClient.projectPlan,
    "findFirst" | "findMany" | "create" | "update" | "delete"
  >;
  projectPlanTasks: Pick<
    typeof prismaClient.projectPlanTasks,
    "findFirst" | "findMany" | "create" | "update" | "updateMany" | "delete" | "deleteMany"
  >;
  taskModel: Pick<typeof prismaClient.taskModel, "findFirst">;
  project: Pick<typeof prismaClient.project, "findFirst">;
  client: Pick<typeof prismaClient.client, "findFirst">;
  user: Pick<typeof prismaClient.user, "findFirst">;
  $transaction: typeof prismaClient.$transaction;
}

export interface ProjectPlanAudit {
  createLog: typeof audit.createLog;
  logUpdateIfChanged: typeof audit.logUpdateIfChanged;
}

export class ProjectPlanService {
  readonly #taskCrudService: TaskCrudService;
  readonly #prisma: ProjectPlanPrisma;
  readonly #audit: ProjectPlanAudit;

  constructor(
    taskCrudService: TaskCrudService = new TaskCrudService(),
    prisma: ProjectPlanPrisma = prismaClient,
    auditIntegration: ProjectPlanAudit = audit,
  ) {
    this.#taskCrudService = taskCrudService;
    this.#prisma = prisma;
    this.#audit = auditIntegration;
  }

  async create(data: CreateProjectPlanRequest): Promise<{ create: ProjectPlanRow }> {
    try {
      const exists = await this.#prisma.projectPlan.findFirst({
        where: {
          name: data.name,
          organization_id: data.organization_id,
        },
      });

      if (exists) {
        throw new ServiceError(409, "Plano com esse nome ja foi cadastrado.");
      }

      const create = await this.#prisma.projectPlan.create({
        data: {
          name: data.name,
          color: data.color,
          organization_id: data.organization_id,
        },
        select: PROJECT_PLAN_SELECT,
      });

      await this.#audit.createLog({
        userId: data.user_id,
        organizationId: data.organization_id,
        action: "Cadastro",
        referring: "integracao.projectPlan",
        referringId: create.id,
        changes: "{}",
      });

      return { create };
    } catch (err: unknown) {
      logError("Erro ao cadastrar plano de projeto", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Nao foi possivel cadastrar o plano.", err);
    }
  }

  async update(data: UpdateProjectPlanRequest): Promise<ProjectPlanRow> {
    try {
      const exists = await this.#prisma.projectPlan.findFirst({
        where: {
          id: data.id,
          organization_id: data.organization_id,
        },
        select: PROJECT_PLAN_SELECT,
      });

      if (!exists) {
        throw new ServiceError(404, "Plano nao encontrado.");
      }

      const updated = await this.#prisma.projectPlan.update({
        where: {
          id: data.id,
        },
        data: {
          name: data.name,
          color: data.color,
        },
        select: PROJECT_PLAN_SELECT,
      });

      await this.#audit.logUpdateIfChanged({
        userId: data.user_id,
        organizationId: data.organization_id,
        action: "Atualizacao",
        referring: "integracao.projectPlan",
        referringId: data.id,
        oldData: exists as Record<string, unknown>,
        updatedData: updated as Record<string, unknown>,
      });

      return updated;
    } catch (err: unknown) {
      logError("Erro ao atualizar plano de projeto", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Nao foi possivel atualizar o plano.", err);
    }
  }

  async detail(planId: string, organizationId: string): Promise<{ detail: ProjectPlanDetailRow }> {
    try {
      const detail = await this.#prisma.projectPlan.findFirst({
        where: {
          id: planId,
          organization_id: organizationId,
        },
        select: PROJECT_PLAN_DETAIL_SELECT,
      });

      if (!detail) {
        throw new ServiceError(404, "Plano nao encontrado.");
      }

      return { detail };
    } catch (err: unknown) {
      logError("Erro ao detalhar plano de projeto", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Nao foi possivel buscar o plano.", err);
    }
  }

  async list(organizationId: string): Promise<ProjectPlanRow[]> {
    try {
      return await this.#prisma.projectPlan.findMany({
        where: {
          organization_id: organizationId,
        },
        select: PROJECT_PLAN_SELECT,
        orderBy: {
          name: "asc",
        },
      });
    } catch (err: unknown) {
      logError("Erro ao listar planos de projeto", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Nao foi possivel listar os planos.", err);
    }
  }

  async delete(data: DeleteProjectPlanRequest): Promise<{ response: true }> {
    try {
      const exists = await this.#prisma.projectPlan.findFirst({
        where: {
          id: data.id,
          organization_id: data.organization_id,
        },
      });

      if (!exists) {
        throw new ServiceError(404, "Plano nao encontrado.");
      }

      const user = await this.#prisma.user.findFirst({
        where: { id: data.user_id },
      });

      if (!user) {
        throw new ServiceError(404, "Usuario nao encontrado.");
      }

      if (user.permission < 2) {
        throw new ServiceError(403, "Usuario nao tem permissao.");
      }

      await this.#prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await tx.projectPlanTasks.deleteMany({
          where: {
            plan_id: data.id,
            organization_id: data.organization_id,
          },
        });

        await tx.projectPlan.delete({
          where: {
            id: data.id,
          },
        });
      });

      return { response: true };
    } catch (err: unknown) {
      logError("Erro ao excluir plano de projeto", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Nao foi possivel excluir o plano.", err);
    }
  }

  async addTask(data: AddProjectPlanTaskRequest): Promise<{ create: ProjectPlanTaskRow }> {
    try {
      const plan = await this.#prisma.projectPlan.findFirst({
        where: {
          id: data.plan_id,
          organization_id: data.organization_id,
        },
      });

      if (!plan) {
        throw new ServiceError(404, "Plano nao encontrado.");
      }

      const taskModel = await this.#prisma.taskModel.findFirst({
        where: {
          id: data.task_id,
          organization_id: data.organization_id,
        },
      });

      if (!taskModel) {
        throw new ServiceError(404, "Modelo de tarefa nao encontrado.");
      }

      const lastTaskInPlan = await this.#prisma.projectPlanTasks.findFirst({
        where: {
          plan_id: data.plan_id,
          organization_id: data.organization_id,
        },
        orderBy: {
          order: "desc",
        },
        select: {
          order: true,
        },
      });

      const finalOrder = lastTaskInPlan ? lastTaskInPlan.order + 1 : 1;

      const create = await this.#prisma.projectPlanTasks.create({
        data: {
          plan_id: data.plan_id,
          task_id: data.task_id,
          order: finalOrder,
          organization_id: data.organization_id,
        },
        select: PROJECT_PLAN_TASK_SELECT,
      });

      await this.#audit.createLog({
        userId: data.user_id,
        organizationId: data.organization_id,
        action: "Cadastro",
        referring: "integracao.projectPlan",
        referringId: create.id,
        changes: "{}",
      });

      return { create };
    } catch (err: unknown) {
      logError("Erro ao adicionar modelo de tarefa ao plano", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Nao foi possivel adicionar a tarefa ao plano.", err);
    }
  }

  async listTasks(planId: string, organizationId: string): Promise<ProjectPlanTaskRow[]> {
    try {
      return await this.#prisma.projectPlanTasks.findMany({
        where: {
          plan_id: planId,
          organization_id: organizationId,
        },
        select: PROJECT_PLAN_TASK_SELECT,
        orderBy: {
          order: "asc",
        },
      });
    } catch (err: unknown) {
      logError("Erro ao listar tarefas do plano", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Nao foi possivel listar as tarefas do plano.", err);
    }
  }

  async reorderTask(
    data: ReorderProjectPlanTaskRequest,
  ): Promise<{ message: string } | { updatedTaskA: ProjectPlanTaskRow; updatedTaskB: ProjectPlanTaskRow }> {
    try {
      const taskA = await this.#prisma.projectPlanTasks.findFirst({
        where: {
          id: data.plan_task_id,
          plan_id: data.plan_id,
          organization_id: data.organization_id,
        },
      });

      if (!taskA) {
        throw new ServiceError(404, "Tarefa nao encontrada neste plano.");
      }

      if (data.direction === "up" && taskA.order === 1) {
        return { message: "A tarefa ja esta no topo." };
      }

      const targetOrder = data.direction === "up" ? taskA.order - 1 : taskA.order + 1;
      const taskB = await this.#prisma.projectPlanTasks.findFirst({
        where: {
          plan_id: data.plan_id,
          order: targetOrder,
          organization_id: data.organization_id,
        },
      });

      if (!taskB) {
        return { message: "Nao e possivel mover a tarefa nesta direcao." };
      }

      const [updatedTaskA, updatedTaskB] = await this.#prisma.$transaction([
        this.#prisma.projectPlanTasks.update({
          where: { id: taskA.id },
          data: { order: taskB.order },
          select: PROJECT_PLAN_TASK_SELECT,
        }),
        this.#prisma.projectPlanTasks.update({
          where: { id: taskB.id },
          data: { order: taskA.order },
          select: PROJECT_PLAN_TASK_SELECT,
        }),
      ]);

      return { updatedTaskA, updatedTaskB };
    } catch (err: unknown) {
      logError("Erro ao reordenar tarefa do plano", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Nao foi possivel reordenar a tarefa do plano.", err);
    }
  }

  async deleteTask(
    data: DeleteProjectPlanTaskRequest,
  ): Promise<{ deleted: ProjectPlanTaskRow }> {
    try {
      const deleted = await this.#prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const taskToDelete = await tx.projectPlanTasks.findFirst({
          where: {
            id: data.plan_task_id,
            plan_id: data.plan_id,
            organization_id: data.organization_id,
          },
          select: PROJECT_PLAN_TASK_SELECT,
        });

        if (!taskToDelete) {
          throw new ServiceError(404, "Tarefa nao encontrada neste plano.");
        }

        await tx.projectPlanTasks.delete({
          where: {
            id: data.plan_task_id,
          },
        });

        await tx.projectPlanTasks.updateMany({
          where: {
            plan_id: data.plan_id,
            organization_id: data.organization_id,
            order: {
              gt: taskToDelete.order,
            },
          },
          data: {
            order: {
              decrement: 1,
            },
          },
        });

        return taskToDelete;
      });

      return { deleted };
    } catch (err: unknown) {
      logError("Erro ao excluir tarefa do plano", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Nao foi possivel excluir a tarefa do plano.", err);
    }
  }

  async hirePlan(data: HireProjectPlanRequest): Promise<{ created: TaskCreateRow[] }> {
    try {
      const plan = await this.#prisma.projectPlan.findFirst({
        where: {
          id: data.plan_id,
          organization_id: data.organization_id,
        },
      });

      if (!plan) {
        throw new ServiceError(404, "Plano nao encontrado.");
      }

      const project = await this.#prisma.project.findFirst({
        where: {
          id: data.project_id,
          organization_id: data.organization_id,
        },
        select: {
          client_id: true,
        },
      });

      if (!project) {
        throw new ServiceError(404, "Projeto nao encontrado.");
      }

      const client = await this.#prisma.client.findFirst({
        where: {
          id: project.client_id,
          organization_id: data.organization_id,
        },
        select: {
          prospecting_status: true,
        },
      });

      if (!client) {
        throw new ServiceError(404, "Cliente nao encontrado.");
      }

      const planTasks = await this.#prisma.projectPlanTasks.findMany({
        where: {
          plan_id: data.plan_id,
          organization_id: data.organization_id,
        },
        select: {
          task_id: true,
        },
        orderBy: {
          order: "asc",
        },
      });

      const created: TaskCreateRow[] = [];
      for (const planTask of planTasks) {
        const result = await this.#taskCrudService.createTask({
          user_id: data.user_id,
          organization_id: data.organization_id,
          model_id: planTask.task_id,
          project_id: data.project_id,
          client_id: project.client_id,
          prospecting_status: client.prospecting_status as ProspectingStatus,
          observations: "",
          urgency: "",
        });

        created.push(result.create);
      }

      return { created };
    } catch (err: unknown) {
      logError("Erro ao contratar plano de projeto", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Nao foi possivel contratar o plano.", err);
    }
  }
}
