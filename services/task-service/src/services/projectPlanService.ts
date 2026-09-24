import {
  INTEGRACAO_PERMISSION_LEVEL,
  type IntegracaoPermissionLevel,
  error as logError,
  requireIntegracaoRouteAccess,
  ServiceError,
} from "@workspace/shared";
import type { ProspectingStatus } from "../constants/prospectingStatus.js";
import type * as Prisma from "../generated/prisma/internal/prismaNamespace.js";
import type { ProjectPlanGetPayload } from "../generated/prisma/models/ProjectPlan.js";
import type { ProjectPlanTasksGetPayload } from "../generated/prisma/models/ProjectPlanTasks.js";
import * as audit from "../integrations/audit.js";
import prismaClient from "../prisma/index.js";
import { assertProjectCommercialValidationReleased } from "./commercialValidationGateService.js";
import { type TaskCreateRow, TaskCrudService } from "./taskCrudService.js";

const HIRE_TRANSACTION_MAX_WAIT_MS = 20_000;
const HIRE_TRANSACTION_TIMEOUT_MS = 60_000;

function isTransactionTimeoutError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const code = "code" in err ? err.code : undefined;
  const message = "message" in err ? String(err.message) : "";
  return code === "P2028" || message.includes("Unable to start a transaction");
}

function isUniqueConstraintError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && err.code === "P2002";
}

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
export type ProjectPlanDetailRow = ProjectPlanGetPayload<{
  select: typeof PROJECT_PLAN_DETAIL_SELECT;
}>;
export type ProjectPlanTaskRow = ProjectPlanTasksGetPayload<{
  select: typeof PROJECT_PLAN_TASK_SELECT;
}>;

export interface CreateProjectPlanRequest {
  user_id: string;
  organization_id: string;
  integracaoLevel?: IntegracaoPermissionLevel;
  isOwner?: boolean;
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
  integracaoLevel?: IntegracaoPermissionLevel;
  isOwner?: boolean;
}

export interface AddProjectPlanTaskRequest {
  plan_id: string;
  task_id: string;
  user_id: string;
  organization_id: string;
  integracaoLevel?: IntegracaoPermissionLevel;
  isOwner?: boolean;
}

export interface ReorderProjectPlanTaskRequest {
  plan_id: string;
  plan_task_id: string;
  direction: "up" | "down";
  user_id: string;
  organization_id: string;
  integracaoLevel?: IntegracaoPermissionLevel;
  isOwner?: boolean;
}

export interface DeleteProjectPlanTaskRequest {
  plan_id: string;
  plan_task_id: string;
  user_id: string;
  organization_id: string;
  integracaoLevel?: IntegracaoPermissionLevel;
  isOwner?: boolean;
}

export interface HireProjectPlanRequest {
  user_id: string;
  organization_id: string;
  project_id: string;
  plan_id: string;
  integracaoLevel?: IntegracaoPermissionLevel;
  isOwner?: boolean;
}

export interface ProjectPlanAuthorization {
  user_id: string;
  organization_id: string;
  integracaoLevel?: IntegracaoPermissionLevel;
  isOwner?: boolean;
}

export interface ProjectPlanHireResponse {
  created: TaskCreateRow[];
  idempotent: boolean;
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
  projectPlanHiring: Pick<typeof prismaClient.projectPlanHiring, "findUnique" | "create">;
  taskModel: Pick<typeof prismaClient.taskModel, "findFirst">;
  project: Pick<typeof prismaClient.project, "findFirst">;
  client: Pick<typeof prismaClient.client, "findFirst">;
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

  #requirePlanAccess(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    data: ProjectPlanAuthorization,
  ): void {
    requireIntegracaoRouteAccess(method, path, {
      userId: data.user_id,
      level: data.integracaoLevel ?? INTEGRACAO_PERMISSION_LEVEL.BASIC,
      organizationId: data.organization_id,
      resourceOrganizationId: data.organization_id,
      isOwner: data.isOwner === true,
    });
  }

  async create(data: CreateProjectPlanRequest): Promise<{ create: ProjectPlanRow }> {
    try {
      this.#requirePlanAccess("POST", "/task/project-plan", data);

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
        changes: JSON.stringify({ name: create.name, color: create.color }),
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
      this.#requirePlanAccess("PUT", "/task/project-plan", data);

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

  async detail(
    planId: string,
    organizationId: string,
    authorization: ProjectPlanAuthorization,
  ): Promise<{ detail: ProjectPlanDetailRow }> {
    try {
      this.#requirePlanAccess("GET", "/task/project-plan", authorization);

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

  async list(
    organizationId: string,
    authorization: ProjectPlanAuthorization,
  ): Promise<ProjectPlanRow[]> {
    try {
      this.#requirePlanAccess("GET", "/task/project-plan/list", authorization);

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
      this.#requirePlanAccess("DELETE", "/task/project-plan", data);

      const exists = await this.#prisma.projectPlan.findFirst({
        where: {
          id: data.id,
          organization_id: data.organization_id,
        },
      });

      if (!exists) {
        throw new ServiceError(404, "Plano nao encontrado.");
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

      await this.#audit.createLog({
        userId: data.user_id,
        organizationId: data.organization_id,
        action: "Exclusao",
        referring: "integracao.projectPlan",
        referringId: data.id,
        changes: JSON.stringify({ planId: data.id }),
      });

      return { response: true };
    } catch (err: unknown) {
      logError("Erro ao excluir plano de projeto", { err });
      if (err instanceof ServiceError) throw err;
      if (typeof err === "object" && err !== null && "code" in err && err.code === "P2003") {
        throw new ServiceError(409, "Não é possível excluir um plano já contratado.");
      }
      throw new ServiceError(500, "Nao foi possivel excluir o plano.", err);
    }
  }

  async addTask(data: AddProjectPlanTaskRequest): Promise<{ create: ProjectPlanTaskRow }> {
    try {
      this.#requirePlanAccess("POST", "/task/project-plan/task", data);

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

      const alreadyInPlan = await this.#prisma.projectPlanTasks.findFirst({
        where: {
          plan_id: data.plan_id,
          task_id: data.task_id,
          organization_id: data.organization_id,
        },
        select: { id: true },
      });

      if (alreadyInPlan) {
        throw new ServiceError(409, "Modelo de tarefa ja esta neste plano.");
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
        changes: JSON.stringify({
          planId: data.plan_id,
          taskModelId: data.task_id,
          order: create.order,
        }),
      });

      return { create };
    } catch (err: unknown) {
      logError("Erro ao adicionar modelo de tarefa ao plano", { err });
      if (isUniqueConstraintError(err)) {
        throw new ServiceError(409, "Modelo de tarefa ja esta neste plano.", err);
      }
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Nao foi possivel adicionar a tarefa ao plano.", err);
    }
  }

  async listTasks(
    planId: string,
    organizationId: string,
    authorization: ProjectPlanAuthorization,
  ): Promise<ProjectPlanTaskRow[]> {
    try {
      this.#requirePlanAccess("GET", "/task/project-plan/task/list", authorization);

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
  ): Promise<
    { message: string } | { updatedTaskA: ProjectPlanTaskRow; updatedTaskB: ProjectPlanTaskRow }
  > {
    try {
      this.#requirePlanAccess("PUT", "/task/project-plan/task", data);

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

      await this.#audit.createLog({
        userId: data.user_id,
        organizationId: data.organization_id,
        action: "Atualizacao",
        referring: "integracao.projectPlan",
        referringId: data.plan_id,
        changes: JSON.stringify({
          planTaskId: data.plan_task_id,
          direction: data.direction,
        }),
      });

      return { updatedTaskA, updatedTaskB };
    } catch (err: unknown) {
      logError("Erro ao reordenar tarefa do plano", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Nao foi possivel reordenar a tarefa do plano.", err);
    }
  }

  async deleteTask(data: DeleteProjectPlanTaskRequest): Promise<{ deleted: ProjectPlanTaskRow }> {
    try {
      this.#requirePlanAccess("DELETE", "/task/project-plan/task", data);

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

      await this.#audit.createLog({
        userId: data.user_id,
        organizationId: data.organization_id,
        action: "Exclusao",
        referring: "integracao.projectPlan",
        referringId: data.plan_id,
        changes: JSON.stringify({ planTaskId: data.plan_task_id }),
      });

      return { deleted };
    } catch (err: unknown) {
      logError("Erro ao excluir tarefa do plano", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Nao foi possivel excluir a tarefa do plano.", err);
    }
  }

  async hirePlan(data: HireProjectPlanRequest): Promise<ProjectPlanHireResponse> {
    try {
      this.#requirePlanAccess("POST", "/task/project-plan/hire", data);

      const result = await this.#prisma.$transaction(
        async (tx: Prisma.TransactionClient) => {
          const lockKey = JSON.stringify([data.organization_id, data.plan_id, data.project_id]);
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;

          const previous = await tx.projectPlanHiring.findUnique({
            where: {
              organization_id_plan_id_project_id: {
                organization_id: data.organization_id,
                plan_id: data.plan_id,
                project_id: data.project_id,
              },
            },
          });
          if (previous) {
            return {
              ...(previous.response_snapshot as unknown as Omit<
                ProjectPlanHireResponse,
                "idempotent"
              >),
              idempotent: true,
            };
          }

          const plan = await tx.projectPlan.findFirst({
            where: { id: data.plan_id, organization_id: data.organization_id },
          });
          if (!plan) {
            throw new ServiceError(404, "Plano nao encontrado.");
          }

          const project = await tx.project.findFirst({
            where: { id: data.project_id, organization_id: data.organization_id },
            select: { client_id: true, status: true },
          });
          if (!project) {
            throw new ServiceError(404, "Projeto nao encontrado.");
          }
          assertProjectCommercialValidationReleased(project);

          const client = await tx.client.findFirst({
            where: { id: project.client_id, organization_id: data.organization_id },
            select: { prospecting_status: true },
          });
          if (!client) {
            throw new ServiceError(404, "Cliente nao encontrado.");
          }

          const planTasks = await tx.projectPlanTasks.findMany({
            where: { plan_id: data.plan_id, organization_id: data.organization_id },
            select: { task_id: true },
            orderBy: { order: "asc" },
          });
          if (planTasks.length === 0) {
            throw new ServiceError(422, "Plano vazio não pode ser contratado.");
          }

          const created: TaskCreateRow[] = [];
          for (const planTask of planTasks) {
            const task = await this.#taskCrudService.createTaskInTransaction(
              {
                user_id: data.user_id,
                organization_id: data.organization_id,
                model_id: planTask.task_id,
                project_id: data.project_id,
                client_id: project.client_id,
                prospecting_status: client.prospecting_status as ProspectingStatus,
                observations: "",
                urgency: "",
                integracaoLevel: data.integracaoLevel,
                isOwner: data.isOwner === true,
              },
              tx,
            );
            created.push(task.create);
          }

          const response = JSON.parse(
            JSON.stringify({ created, idempotent: false }),
          ) as ProjectPlanHireResponse;
          await this.#audit.createLog({
            userId: data.user_id,
            organizationId: data.organization_id,
            action: "Cadastro",
            referring: "integracao.projectPlan",
            referringId: data.plan_id,
            required: true,
            changes: {
              source: "project-plan-hire",
              projectId: data.project_id,
              taskIds: created.map(({ id }) => id),
            },
          });
          await tx.projectPlanHiring.create({
            data: {
              organization_id: data.organization_id,
              plan_id: data.plan_id,
              project_id: data.project_id,
              response_snapshot: response as unknown as Prisma.InputJsonValue,
            },
          });

          return response;
        },
        // A contratação serializa pelo advisory lock e cria uma tarefa por modelo:
        // as chamadas concorrentes precisam esperar a primeira terminar.
        { maxWait: HIRE_TRANSACTION_MAX_WAIT_MS, timeout: HIRE_TRANSACTION_TIMEOUT_MS },
      );
      return result;
    } catch (err: unknown) {
      logError("Erro ao contratar plano de projeto", { err });
      if (err instanceof ServiceError) throw err;
      if (isTransactionTimeoutError(err)) {
        throw new ServiceError(
          409,
          "A contratacao do plano esta em andamento. Tente novamente.",
          err,
        );
      }
      throw new ServiceError(500, "Nao foi possivel contratar o plano.", err);
    }
  }
}
