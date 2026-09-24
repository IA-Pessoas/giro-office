import { createHash } from "node:crypto";
import {
  createProjectInTransaction,
  INTEGRACAO_PERMISSION_LEVEL,
  type IntegracaoPermissionLevel,
  error as logError,
  requireIntegracaoRouteAccess,
  ServiceError,
} from "@workspace/shared";
import {
  INTEGRACAO_TASK_STATUS_TODO,
  INTEGRACAO_TASK_STATUS_WAITING,
  type IntegracaoTaskStatus,
} from "../constants/integracaoTask.js";
import { PROSPECTING_STATUS_CLOSED } from "../constants/prospectingStatus.js";
import type { Prisma } from "../generated/prisma/client.js";
import type { TaskAudit } from "../integrations/audit.js";
import type {
  CreatedProject,
  CreateProjectFromWizardParams,
} from "../integrations/projectWizard.js";
import type prismaClient from "../prisma/index.js";
import { listEligibleTaskResponsibles } from "./responsibleUserContext.js";
import { type CreateTaskCrudRequest, resolveEligibleTaskResponsible } from "./taskCrudService.js";

const PROJECT_WIZARD_MODEL_TYPE = "Projeto";
const PROJECT_WIZARD_DEPARTMENT_STATUS_ACTIVE = "Ativo";

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

interface ProjectWizardConfirmationResponse {
  project: CreatedProject;
  counts: { main: number; dependencies: number; unassigned: number };
}

function commandHash(data: CreateProjectWizardRequest): string {
  // Projeção explícita: credenciais, permissões e headers não fazem parte do comando.
  return createHash("sha256")
    .update(
      JSON.stringify({
        client_id: data.client_id,
        name: data.name,
        start_date: data.start_date.toISOString(),
        end_date: data.end_date?.toISOString(),
        objective: data.objective,
        revision: data.revision,
        tasks: data.tasks.map((task) => ({
          name: task.name,
          department_id: task.department_id,
          model_id: task.model_id,
          prevision_date: task.prevision_date,
          responsible_id: task.responsible_id,
        })),
      }),
    )
    .digest("hex");
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
  organization_id?: string;
  department_id: string;
  department_organization_id?: string;
  responsible_id: string | null;
  observations: string | null;
  type: string | null;
  department_status: string;
  dependencies: Array<{
    dependent_id: string;
    organization_id?: string;
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
  status: IntegracaoTaskStatus;
  observation: string;
  responsible_id: string | null;
  prevision_date?: string;
  dependencies: Array<Omit<ProjectWizardPreviewTask, "dependencies" | "prevision_date">>;
}

function createProjectWizardCompositionRepository(
  client: Prisma.TransactionClient,
): ProjectWizardCompositionRepository {
  return {
    async findTaskModels(organizationId, modelIds) {
      const models = await client.taskModel.findMany({
        where: { organization_id: organizationId, id: { in: modelIds } },
        select: {
          id: true,
          name: true,
          organization_id: true,
          department_id: true,
          responsible_id: true,
          observations: true,
          type: true,
          department: { select: { status: true, organization_id: true } },
          dependencies: {
            select: {
              dependent_id: true,
              organization_id: true,
              wait: true,
              observation: true,
              dependent: {
                select: {
                  id: true,
                  name: true,
                  organization_id: true,
                  department_id: true,
                  responsible_id: true,
                  observations: true,
                  type: true,
                  department: { select: { status: true, organization_id: true } },
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
        department_organization_id: department.organization_id,
        dependencies: dependencies.map(({ dependent, ...dependency }) => ({
          ...dependency,
          dependent: {
            ...dependent,
            department_status: dependent.department.status,
            department_organization_id: dependent.department.organization_id,
          },
        })),
      }));
    },
    listEligibleTaskResponsibles: (organizationId, departmentId) =>
      listEligibleTaskResponsibles(client, organizationId, departmentId),
  };
}

function isEligibleModel(
  model: Omit<ProjectWizardModel, "dependencies">,
  organizationId: string,
  departmentId?: string,
): boolean {
  return !(
    (model.organization_id !== undefined && model.organization_id !== organizationId) ||
    (model.department_organization_id !== undefined &&
      model.department_organization_id !== organizationId) ||
    model.type !== PROJECT_WIZARD_MODEL_TYPE ||
    model.department_status !== PROJECT_WIZARD_DEPARTMENT_STATUS_ACTIVE ||
    (departmentId !== undefined && model.department_id !== departmentId)
  );
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

export interface ProjectWizardServiceDeps {
  db: typeof prismaClient;
  audit: Pick<TaskAudit, "createLog">;
  taskService: {
    createTaskInTransaction(
      data: CreateTaskCrudRequest,
      tx: Prisma.TransactionClient,
      options?: { allowPendingCommercialProject?: boolean },
    ): Promise<{
      create: { id: string; responsible_id: string | null };
    }>;
  };
  compositionRepository?: typeof createProjectWizardCompositionRepository;
}

export class ProjectWizardService {
  private readonly db: ProjectWizardServiceDeps["db"];
  private readonly audit: ProjectWizardServiceDeps["audit"];
  private readonly taskService: ProjectWizardServiceDeps["taskService"];
  private readonly compositionRepository: typeof createProjectWizardCompositionRepository;

  constructor({
    db,
    audit,
    taskService,
    compositionRepository = createProjectWizardCompositionRepository,
  }: ProjectWizardServiceDeps) {
    this.db = db;
    this.audit = audit;
    this.taskService = taskService;
    this.compositionRepository = compositionRepository;
  }

  async preview(data: ProjectWizardPreviewRequest): Promise<{
    tasks: ProjectWizardPreviewTask[];
    revision: string;
  }> {
    return this.#compose(data, this.compositionRepository(this.db));
  }

  async #compose(
    data: ProjectWizardPreviewRequest,
    repository: ProjectWizardCompositionRepository,
  ): Promise<{
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
        : await repository.findTaskModels(
            data.organizationId,
            data.tasks.map(({ model_id }) => model_id),
          );
    const modelsById = new Map(models.map((model) => [model.id, model]));
    const seen = new Map<string, string>();
    const tasks: ProjectWizardPreviewTask[] = [];

    for (const [index, task] of data.tasks.entries()) {
      const model = modelsById.get(task.model_id);
      if (!model) {
        throw new ServiceError(
          422,
          "Modelo de tarefa não é elegível para o departamento informado.",
        );
      }

      if (!isEligibleModel(model, data.organizationId, task.department_id)) {
        throw new ServiceError(
          422,
          "Modelo de tarefa não é elegível para o departamento informado.",
        );
      }

      const principal = `principal ${index + 1} (${task.name})`;
      const previous = seen.get(model.id);
      if (previous) {
        throw new ServiceError(
          409,
          `Modelo ${model.id} repetido entre ${previous} e ${principal}.`,
        );
      }
      seen.set(model.id, principal);

      const responsible_id = resolveEligibleTaskResponsible(
        await repository.listEligibleTaskResponsibles(data.organizationId, model.department_id),
        model.responsible_id,
        task.responsible_id,
      );
      const dependencies: ProjectWizardPreviewTask["dependencies"] = [];

      for (const dependency of model.dependencies) {
        if (
          (dependency.organization_id !== undefined &&
            dependency.organization_id !== data.organizationId) ||
          !isEligibleModel(dependency.dependent, data.organizationId)
        ) {
          throw new ServiceError(422, "Modelo dependente não é elegível.");
        }

        const duplicate = seen.get(dependency.dependent_id);
        const item = `dependência ${dependency.dependent_id} da ${principal}`;
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
          status: dependency.wait ? INTEGRACAO_TASK_STATUS_WAITING : INTEGRACAO_TASK_STATUS_TODO,
          observation: dependency.observation,
          responsible_id: resolveEligibleTaskResponsible(
            await repository.listEligibleTaskResponsibles(
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

  async create(data: CreateProjectWizardRequest): Promise<ProjectWizardConfirmationResponse> {
    requireIntegracaoRouteAccess("POST", "/task/project-wizard", {
      userId: data.userId,
      level: data.integracaoLevel ?? INTEGRACAO_PERMISSION_LEVEL.BASIC,
      organizationId: data.organizationId,
      resourceOrganizationId: data.organizationId,
      isOwner: data.isOwner === true,
      requestedFields: ["name", "client_id", "start_date", "end_date", "objective"],
    });

    const hash = commandHash(data);
    const result = await this.db.$transaction(async (tx) => {
      const lockKey = JSON.stringify([data.organizationId, data.idempotencyKey]);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
      const previous = await tx.projectWizardConfirmation.findUnique({
        where: {
          organization_id_idempotency_key: {
            organization_id: data.organizationId,
            idempotency_key: data.idempotencyKey,
          },
        },
      });
      if (previous) {
        if (previous.command_hash !== hash) {
          throw new ServiceError(409, "Idempotency-Key já utilizada com outro comando.");
        }
        return {
          response: previous.response_snapshot as unknown as ProjectWizardConfirmationResponse,
        };
      }
      let preview: Awaited<ReturnType<ProjectWizardService["preview"]>>;
      try {
        preview = await this.#compose(data, this.compositionRepository(tx));
      } catch (err: unknown) {
        logError("Erro ao recalcular prévia do wizard antes da criação", { err });
        if (err instanceof ServiceError && err.statusCode === 422) {
          throw new ServiceError(
            409,
            "A configuração das dependências foi alterada. Gere uma nova prévia.",
          );
        }
        throw err;
      }
      if (preview.revision !== data.revision) {
        throw new ServiceError(
          409,
          "A configuração das dependências foi alterada. Gere uma nova prévia.",
        );
      }

      const { create: project } = await createProjectInTransaction(data, tx);
      const createdTasks = [];
      let mainCount = 0;
      for (const { dependencies, ...principal } of preview.tasks) {
        const tasks: Array<Omit<ProjectWizardPreviewTask, "dependencies">> = [
          principal,
          ...dependencies,
        ];
        for (const task of tasks) {
          const result = await this.taskService.createTaskInTransaction(
            {
              user_id: data.userId,
              organization_id: data.organizationId,
              model_id: task.model_id,
              project_id: project.id,
              client_id: data.client_id,
              prospecting_status: PROSPECTING_STATUS_CLOSED,
              name: task.name,
              status: task.status,
              department_id: task.department_id,
              observations: task.observation,
              urgency: "",
              responsible_id: task.responsible_id,
              ...(task.prevision_date === undefined ? {} : { prevision_date: task.prevision_date }),
              integracaoLevel: data.integracaoLevel,
              isOwner: data.isOwner === true,
              createDependencies: false,
            },
            tx,
            { allowPendingCommercialProject: true },
          );
          createdTasks.push(result.create);
        }
        mainCount += 1;
      }

      const response: ProjectWizardConfirmationResponse = JSON.parse(
        JSON.stringify({
          project,
          counts: {
            main: mainCount,
            dependencies: createdTasks.length - mainCount,
            unassigned: createdTasks.filter(({ responsible_id }) => responsible_id === null).length,
          },
        }),
      );
      await tx.projectWizardConfirmation.create({
        data: {
          organization_id: data.organizationId,
          idempotency_key: data.idempotencyKey,
          project_id: project.id,
          command_hash: hash,
          response_snapshot: response as unknown as Prisma.InputJsonValue,
        },
      });
      return { response, taskIds: createdTasks.map(({ id }) => id) };
    });

    if (result.taskIds) {
      try {
        await this.audit.createLog({
          userId: data.userId,
          organizationId: data.organizationId,
          action: "Cadastro",
          referring: "integracao.projects",
          referringId: result.response.project.id,
          changes: {
            source: "project-wizard",
            projectId: result.response.project.id,
            taskIds: result.taskIds,
            counts: result.response.counts,
          },
        });
      } catch {
        logError("Falha ao auditar confirmação do wizard após commit", {
          projectId: result.response.project.id,
          organizationId: data.organizationId,
        });
      }
    }
    return result.response;
  }
}
