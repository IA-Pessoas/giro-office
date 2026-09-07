import { createHash } from "node:crypto";
import {
  INTEGRACAO_PERMISSION_LEVEL,
  type IntegracaoPermissionLevel,
  requireIntegracaoRouteAccess,
  ServiceError,
} from "@workspace/shared";
import { INTEGRACAO_TASK_STATUS_TODO } from "../constants/integracaoTask.js";
import { PROSPECTING_STATUS_CLOSED } from "../constants/prospectingStatus.js";
import type {
  CreatedProject,
  CreateProjectFromWizardParams,
  ProjectWizardIntegration,
} from "../integrations/projectWizard.js";
import { createHttpProjectWizardIntegration } from "../integrations/projectWizard.js";
import prismaClient from "../prisma/index.js";
import { listEligibleTaskResponsibles } from "./responsibleUserContext.js";
import {
  type CreateTaskCrudRequest,
  resolveEligibleTaskResponsible,
  TaskCrudService,
} from "./taskCrudService.js";

export interface ProjectWizardTask {
  name: string;
  department_id: string;
  model_id: string;
  prevision_date?: string;
  responsible_id?: string | null;
}

export interface CreateProjectWizardRequest extends CreateProjectFromWizardParams {
  integracaoLevel?: IntegracaoPermissionLevel;
  isOwner?: boolean;
  tasks: ProjectWizardTask[];
  revision: string;
}

export interface ProjectWizardPreviewRequest {
  userId: string;
  organizationId: string;
  integracaoLevel?: IntegracaoPermissionLevel;
  isOwner?: boolean;
  tasks: ProjectWizardTask[];
}

export interface ProjectWizardModel {
  id: string;
  name: string;
  department_id: string;
  responsible_id: string | null;
  observations: string | null;
  type: string | null;
  department_status: string;
  dependencies: Array<{
    dependent_id: string;
    wait: boolean;
    observation: string;
    dependent: Omit<ProjectWizardModel, "dependencies">;
  }>;
}

export interface ProjectWizardCompositionRepository {
  findTaskModels(organizationId: string, modelIds: string[]): Promise<ProjectWizardModel[]>;
  listEligibleTaskResponsibles(
    organizationId: string,
    departmentId: string,
  ): Promise<Array<{ id: string }>>;
}

export interface ProjectWizardPreviewTask {
  name: string;
  model_id: string;
  department_id: string;
  status: "A Realizar" | "Em Espera";
  observation: string;
  responsible_id: string | null;
  prevision_date?: string;
  dependencies: Array<Omit<ProjectWizardPreviewTask, "dependencies" | "prevision_date">>;
}

function createProjectWizardCompositionRepository(): ProjectWizardCompositionRepository {
  return {
    async findTaskModels(organizationId, modelIds) {
      const models = await prismaClient.taskModel.findMany({
        where: { organization_id: organizationId, id: { in: modelIds } },
        select: {
          id: true,
          name: true,
          department_id: true,
          responsible_id: true,
          observations: true,
          type: true,
          department: { select: { status: true } },
          dependencies: {
            where: { organization_id: organizationId },
            select: {
              dependent_id: true,
              wait: true,
              observation: true,
              dependent: {
                select: {
                  id: true,
                  name: true,
                  department_id: true,
                  responsible_id: true,
                  observations: true,
                  type: true,
                  department: { select: { status: true } },
                },
              },
            },
            orderBy: { dependent_id: "asc" },
          },
        },
      });

      return models.map(({ department, dependencies, ...model }) => ({
        ...model,
        department_status: department.status,
        dependencies: dependencies.map(({ dependent, ...dependency }) => ({
          ...dependency,
          dependent: { ...dependent, department_status: dependent.department.status },
        })),
      }));
    },
    listEligibleTaskResponsibles: (organizationId, departmentId) =>
      listEligibleTaskResponsibles(prismaClient, organizationId, departmentId),
  };
}

function assertEligibleModel(
  model: Omit<ProjectWizardModel, "dependencies">,
  departmentId?: string,
): void {
  if (
    model.type !== "Projeto" ||
    model.department_status !== "Ativo" ||
    (departmentId !== undefined && model.department_id !== departmentId)
  ) {
    throw new Error("MODEL_NOT_ELIGIBLE");
  }
}

function revisionFor(tasks: ProjectWizardPreviewTask[]): string {
  const stableTasks = [...tasks]
    .sort((left, right) => left.model_id.localeCompare(right.model_id))
    .map(({ dependencies, ...task }) => ({
      ...task,
      dependencies: [...dependencies]
        .sort((left, right) => left.model_id.localeCompare(right.model_id))
        .map((dependency) => ({ ...dependency })),
    }));
  return createHash("sha256").update(JSON.stringify(stableTasks)).digest("hex");
}

export class ProjectWizardService {
  constructor(
    private readonly projectIntegration: ProjectWizardIntegration = createHttpProjectWizardIntegration(),
    private readonly taskService: {
      createTask(data: CreateTaskCrudRequest): Promise<{
        create: { responsible_id: string | null };
      }>;
    } = new TaskCrudService(),
    private readonly compositionRepository: ProjectWizardCompositionRepository = createProjectWizardCompositionRepository(),
  ) {}

  async preview(data: ProjectWizardPreviewRequest): Promise<{
    tasks: ProjectWizardPreviewTask[];
    revision: string;
  }> {
    requireIntegracaoRouteAccess("POST", "/task/project-wizard/preview", {
      userId: data.userId,
      level: data.integracaoLevel ?? INTEGRACAO_PERMISSION_LEVEL.BASIC,
      organizationId: data.organizationId,
      resourceOrganizationId: data.organizationId,
      isOwner: data.isOwner === true,
    });

    const models =
      data.tasks.length === 0
        ? []
        : await this.compositionRepository.findTaskModels(
            data.organizationId,
            data.tasks.map(({ model_id }) => model_id),
          );
    const modelsById = new Map(models.map((model) => [model.id, model]));
    const seen = new Map<string, string>();
    const tasks: ProjectWizardPreviewTask[] = [];

    for (const task of data.tasks) {
      const model = modelsById.get(task.model_id);
      if (!model) {
        throw new ServiceError(
          422,
          "Modelo de tarefa não é elegível para o departamento informado.",
        );
      }

      try {
        assertEligibleModel(model, task.department_id);
      } catch {
        throw new ServiceError(
          422,
          "Modelo de tarefa não é elegível para o departamento informado.",
        );
      }

      const previous = seen.get(model.id);
      if (previous) {
        throw new ServiceError(
          409,
          `Modelo ${model.id} repetido entre ${previous} e principal ${model.id}.`,
        );
      }
      seen.set(model.id, `principal ${model.id}`);

      const responsible_id = resolveEligibleTaskResponsible(
        await this.compositionRepository.listEligibleTaskResponsibles(
          data.organizationId,
          model.department_id,
        ),
        model.responsible_id,
        task.responsible_id,
      );
      const dependencies: ProjectWizardPreviewTask["dependencies"] = [];

      for (const dependency of model.dependencies) {
        try {
          assertEligibleModel(dependency.dependent);
        } catch {
          throw new ServiceError(422, "Modelo dependente não é elegível.");
        }

        const duplicate = seen.get(dependency.dependent_id);
        const item = `dependência ${dependency.dependent_id} da principal ${model.id}`;
        if (duplicate) {
          throw new ServiceError(
            409,
            `Modelo ${dependency.dependent_id} repetido entre ${duplicate} e ${item}.`,
          );
        }
        seen.set(dependency.dependent_id, item);

        dependencies.push({
          name: dependency.dependent.name,
          model_id: dependency.dependent_id,
          department_id: dependency.dependent.department_id,
          status: dependency.wait ? "Em Espera" : INTEGRACAO_TASK_STATUS_TODO,
          observation: dependency.observation,
          responsible_id: resolveEligibleTaskResponsible(
            await this.compositionRepository.listEligibleTaskResponsibles(
              data.organizationId,
              dependency.dependent.department_id,
            ),
            dependency.dependent.responsible_id,
            undefined,
          ),
        });
      }

      tasks.push({
        name: task.name,
        model_id: model.id,
        department_id: model.department_id,
        status: INTEGRACAO_TASK_STATUS_TODO,
        observation: model.observations ?? "",
        responsible_id,
        ...(task.prevision_date === undefined ? {} : { prevision_date: task.prevision_date }),
        dependencies,
      });
    }

    return { tasks, revision: revisionFor(tasks) };
  }

  async create(data: CreateProjectWizardRequest): Promise<{
    project: CreatedProject;
    counts: { main: number; dependencies: number; unassigned: number };
  }> {
    requireIntegracaoRouteAccess("POST", "/task/project-wizard", {
      userId: data.userId,
      level: data.integracaoLevel ?? INTEGRACAO_PERMISSION_LEVEL.BASIC,
      organizationId: data.organizationId,
      resourceOrganizationId: data.organizationId,
      isOwner: data.isOwner === true,
      requestedFields: ["name", "client_id", "start_date", "end_date", "objective"],
    });

    const preview = await this.preview(data);
    if (preview.revision !== data.revision) {
      throw new ServiceError(
        409,
        "A configuração das dependências foi alterada. Gere uma nova prévia.",
      );
    }

    const project = await this.projectIntegration.createProject(data);
    const createdTasks = [];

    for (const task of preview.tasks) {
      const result = await this.taskService.createTask({
        user_id: data.userId,
        organization_id: data.organizationId,
        model_id: task.model_id,
        project_id: project.id,
        client_id: data.client_id,
        prospecting_status: PROSPECTING_STATUS_CLOSED,
        name: task.name,
        status: INTEGRACAO_TASK_STATUS_TODO,
        department_id: task.department_id,
        observations: task.observation,
        urgency: "",
        responsible_id: task.responsible_id,
        prevision_date: task.prevision_date,
        integracaoLevel: data.integracaoLevel,
        isOwner: data.isOwner === true,
        createDependencies: false,
      });
      createdTasks.push(result.create);

      for (const dependency of task.dependencies) {
        const dependent = await this.taskService.createTask({
          user_id: data.userId,
          organization_id: data.organizationId,
          model_id: dependency.model_id,
          project_id: project.id,
          client_id: data.client_id,
          prospecting_status: PROSPECTING_STATUS_CLOSED,
          name: dependency.name,
          status: dependency.status,
          department_id: dependency.department_id,
          observations: dependency.observation,
          urgency: "",
          responsible_id: dependency.responsible_id,
          integracaoLevel: data.integracaoLevel,
          isOwner: data.isOwner === true,
          createDependencies: false,
        });
        createdTasks.push(dependent.create);
      }
    }

    return {
      project,
      counts: {
        main: preview.tasks.length,
        dependencies: createdTasks.length - preview.tasks.length,
        unassigned: createdTasks.filter(({ responsible_id }) => responsible_id === null).length,
      },
    };
  }
}
