import {
  INTEGRACAO_PERMISSION_LEVEL,
  type IntegracaoPermissionLevel,
  error as logError,
  requireIntegracaoRouteAccess,
  ServiceError,
} from "@workspace/shared";

import type {
  AiTaskExtractionContext,
  AiTaskExtractionProvider,
  AiTaskProposal,
} from "../integrations/aiTaskExtraction.js";
import prismaClient from "../prisma/index.js";

export const PROJECT_TASK_MODEL_TYPE = "Projeto";

export interface ExtractProjectTasksRequest {
  userId: string;
  organizationId: string;
  integracaoLevel?: IntegracaoPermissionLevel;
  isOwner?: boolean;
  content: string;
  name: string;
  objective: string;
  start_date: Date;
  end_date?: Date;
}

export interface ProjectTaskProposal {
  name: string;
  prevision_date?: string;
  department_id?: string;
  model_id?: string;
}

export type ExtractionPrisma = Pick<typeof prismaClient, "department">;

interface CatalogDepartment {
  id: string;
  name: string;
  tasksModel: Array<{ id: string; name: string }>;
}

const CIVIL_DATE = /^\d{4}-\d{2}-\d{2}$/;

function toCivilDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function normalizeName(value: string): string {
  return value.trim().toLocaleLowerCase("pt-BR");
}

function normalizePrevisionDate(value: string | undefined): string | undefined {
  if (!value || !CIVIL_DATE.test(value)) return undefined;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) || toCivilDate(parsed) !== value ? undefined : value;
}

export class ProjectWizardExtractionService {
  constructor(
    private readonly provider: AiTaskExtractionProvider,
    private readonly prisma: ExtractionPrisma = prismaClient,
  ) {}

  async extractTasks(data: ExtractProjectTasksRequest): Promise<{ tasks: ProjectTaskProposal[] }> {
    requireIntegracaoRouteAccess("POST", "/task/project-wizard/extract-tasks", {
      userId: data.userId,
      level: data.integracaoLevel ?? INTEGRACAO_PERMISSION_LEVEL.BASIC,
      organizationId: data.organizationId,
      resourceOrganizationId: data.organizationId,
      isOwner: data.isOwner === true,
    });

    const catalog = await this.listCatalog(data.organizationId);
    const proposals = await this.callProvider(data, catalog);
    const tasks = proposals
      .map((proposal) => toTaskProposal(proposal, catalog))
      .filter((task): task is ProjectTaskProposal => task !== null);

    if (tasks.length === 0) {
      throw new ServiceError(422, "Nenhuma tarefa foi identificada na Ata.");
    }

    return { tasks };
  }

  private async listCatalog(organizationId: string): Promise<CatalogDepartment[]> {
    try {
      return (await this.prisma.department.findMany({
        where: { organization_id: organizationId, status: "Ativo" },
        select: {
          id: true,
          name: true,
          tasksModel: {
            where: { organization_id: organizationId, type: PROJECT_TASK_MODEL_TYPE },
            select: { id: true, name: true },
            orderBy: { name: "asc" },
          },
        },
        orderBy: { name: "asc" },
      })) as CatalogDepartment[];
    } catch (err: unknown) {
      logError("Erro ao listar departamentos e Modelos para a extração de tarefas.", { err });
      throw new ServiceError(500, "Não foi possível carregar departamentos e Modelos.", err);
    }
  }

  private async callProvider(
    data: ExtractProjectTasksRequest,
    catalog: CatalogDepartment[],
  ): Promise<AiTaskProposal[]> {
    try {
      return await this.provider.extract({
        content: data.content,
        context: buildContext(data, catalog),
      });
    } catch (err: unknown) {
      if (err instanceof ServiceError) throw err;
      logError("Falha na extração de tarefas propostas pela IA.");
      throw new ServiceError(502, "Não foi possível extrair tarefas da Ata.", err);
    }
  }
}

function buildContext(
  data: ExtractProjectTasksRequest,
  catalog: CatalogDepartment[],
): AiTaskExtractionContext {
  return {
    project: {
      name: data.name,
      objective: data.objective,
      start_date: toCivilDate(data.start_date),
      ...(data.end_date ? { end_date: toCivilDate(data.end_date) } : {}),
    },
    departments: catalog.map(({ name, tasksModel }) => ({
      name,
      taskModels: tasksModel.map((model) => model.name),
    })),
  };
}

function toTaskProposal(
  proposal: AiTaskProposal,
  catalog: CatalogDepartment[],
): ProjectTaskProposal | null {
  const name = proposal.name?.trim();
  if (!name) return null;

  const departmentName = proposal.department ? normalizeName(proposal.department) : undefined;
  const department = departmentName
    ? catalog.find((item) => normalizeName(item.name) === departmentName)
    : undefined;
  const modelName = proposal.model ? normalizeName(proposal.model) : undefined;
  const model =
    department && modelName
      ? department.tasksModel.find((item) => normalizeName(item.name) === modelName)
      : undefined;
  const previsionDate = normalizePrevisionDate(proposal.prevision_date);

  return {
    name,
    ...(previsionDate ? { prevision_date: previsionDate } : {}),
    ...(department ? { department_id: department.id } : {}),
    ...(model ? { model_id: model.id } : {}),
  };
}
