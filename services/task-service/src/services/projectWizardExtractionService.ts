import {
  INTEGRACAO_PERMISSION_LEVEL,
  type IntegracaoPermissionLevel,
  error as logError,
  requireIntegracaoRouteAccess,
  ServiceError,
} from "@workspace/shared";

import {
  type AiTaskExtractionContext,
  type AiTaskExtractionProvider,
  type AiTaskProposal,
  LIST_ITEM_PREFIX,
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
  prevision_date_warning?: string;
}

export type ExtractionPrisma = Pick<typeof prismaClient, "department">;

interface CatalogDepartment {
  id: string;
  name: string;
  tasksModel: Array<{ id: string; name: string }>;
}

/** Aceita a data civil sozinha ou com horário anexado; o horário é sempre descartado. */
const CIVIL_DATE = /^(\d{4}-\d{2}-\d{2})(?:[T ].*)?$/;

export const PREVISION_DATE_WARNING =
  "A IA sugeriu um prazo que não é uma data civil inequívoca. Informe a data para revisão.";

function toCivilDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function normalizeName(value: string): string {
  return value.normalize("NFC").trim().toLocaleLowerCase("pt-BR");
}

/** Título exibido ao usuário: acentos compostos, espaços colapsados e inicial maiúscula. */
function normalizeTitle(value: string): string {
  const title = value.normalize("NFC").replace(LIST_ITEM_PREFIX, "").replace(/\s+/g, " ").trim();
  return title ? `${title.charAt(0).toLocaleUpperCase("pt-BR")}${title.slice(1)}` : "";
}

function normalizePrevisionDate(value: string | undefined): string | undefined {
  const day = value ? CIVIL_DATE.exec(value.trim())?.[1] : undefined;
  if (!day) return undefined;
  const parsed = new Date(`${day}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) || toCivilDate(parsed) !== day ? undefined : day;
}

/** Nomes homônimos após a normalização são correspondência conflitante: ninguém vence. */
function indexByName<T extends { name: string }>(items: T[]): Map<string, T | null> {
  const index = new Map<string, T | null>();
  for (const item of items) {
    const key = normalizeName(item.name);
    index.set(key, index.has(key) ? null : item);
  }
  return index;
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
    const departmentsByName = indexByName(catalog);
    const tasks = proposals
      .map((proposal) => toTaskProposal(proposal, departmentsByName))
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
  departmentsByName: Map<string, CatalogDepartment | null>,
): ProjectTaskProposal | null {
  const name = normalizeTitle(proposal.name ?? "");
  if (!name) return null;

  const department = proposal.department
    ? (departmentsByName.get(normalizeName(proposal.department)) ?? null)
    : null;
  const model =
    department && proposal.model
      ? (indexByName(department.tasksModel).get(normalizeName(proposal.model)) ?? null)
      : null;
  const previsionDate = normalizePrevisionDate(proposal.prevision_date);
  const suggestedDate = proposal.prevision_date?.trim();

  return {
    name,
    ...(previsionDate ? { prevision_date: previsionDate } : {}),
    ...(department ? { department_id: department.id } : {}),
    ...(model ? { model_id: model.id } : {}),
    ...(!previsionDate && suggestedDate ? { prevision_date_warning: PREVISION_DATE_WARNING } : {}),
  };
}
