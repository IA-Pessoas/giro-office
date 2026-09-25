import {
  INTEGRACAO_PERMISSION_LEVEL,
  type IntegracaoPermissionLevel,
  error as logError,
  requireIntegracaoRouteAccess,
  ServiceError,
} from "@workspace/shared";
import { z } from "zod";

import type {
  AiTaskExtractionContext,
  AiTaskExtractionProvider,
  AiTaskProposal,
} from "../integrations/aiTaskExtraction.js";
import type prismaClient from "../prisma/index.js";
import { isIsoCalendarDate } from "../utils/civilDate.js";

export const PROJECT_TASK_MODEL_TYPE = "Projeto";
const PROVIDER_SOURCE_PART_MAX_CHARS = 100_000;
const AI_TASK_PROPOSALS_SCHEMA = z.array(
  z
    .object({
      name: z.string(),
      prevision_date: z.string().optional(),
      department: z.string().optional(),
      model: z.string().optional(),
    })
    .strict(),
);

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

/**
 * Aceita a data civil sozinha ou com horário sem fuso: um deslocamento como -03:00 poderia
 * apontar para outro dia civil, e dia ambíguo é dia em branco.
 */
const CIVIL_DATE = /^(\d{4}-\d{2}-\d{2})(?:[T ][\d:.]+Z?)?$/;

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
  const title = value.normalize("NFC").replace(/\s+/g, " ").trim();
  return title ? `${title.charAt(0).toLocaleUpperCase("pt-BR")}${title.slice(1)}` : "";
}

function normalizePrevisionDate(value: string | undefined): string | undefined {
  const day = value ? CIVIL_DATE.exec(value.trim())?.[1] : undefined;
  return day && isIsoCalendarDate(day) ? day : undefined;
}

/** Nomes homônimos após a normalização são correspondência conflitante: ninguém vence. */
function findUniqueByName<T extends { name: string }>(
  items: T[],
  name: string | undefined,
): T | undefined {
  if (!name) return undefined;
  const key = normalizeName(name);
  const matches = items.filter((item) => normalizeName(item.name) === key);
  return matches.length === 1 ? matches[0] : undefined;
}

export class ProjectWizardExtractionService {
  constructor(
    private readonly provider: AiTaskExtractionProvider,
    private readonly prisma: ExtractionPrisma,
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
    const parts = partitionMeetingMinutes(data.content);

    try {
      const context = buildContext(data, catalog);
      const proposals: AiTaskProposal[][] = [];

      for (const content of parts) {
        const result = AI_TASK_PROPOSALS_SCHEMA.safeParse(
          await this.provider.extract({ content, context }),
        );
        if (!result.success) {
          throw new ServiceError(502, "Resposta da IA em formato incompatível.");
        }
        proposals.push(result.data);
      }

      return deduplicateProposalsBetweenParts(proposals);
    } catch {
      logError("Falha na extração de tarefas propostas pela IA.");
      throw new ServiceError(
        502,
        "Não foi possível extrair tarefas da Ata inteira.",
        undefined,
        undefined,
        { expose: true },
      );
    }
  }
}

function partitionMeetingMinutes(content: string): string[] {
  const parts: string[] = [];
  let offset = 0;

  while (content.length - offset > PROVIDER_SOURCE_PART_MAX_CHARS) {
    const limit = offset + PROVIDER_SOURCE_PART_MAX_CHARS;
    const newline = content.lastIndexOf("\n", limit - 1);
    let end = newline >= offset ? newline + 1 : limit;
    if (
      end === limit &&
      isHighSurrogate(content.charCodeAt(end - 1)) &&
      isLowSurrogate(content.charCodeAt(end))
    ) {
      end -= 1;
    }
    parts.push(content.slice(offset, end));
    offset = end;
  }

  parts.push(content.slice(offset));
  return parts;
}

function isHighSurrogate(codeUnit: number): boolean {
  return codeUnit >= 0xd800 && codeUnit <= 0xdbff;
}

function isLowSurrogate(codeUnit: number): boolean {
  return codeUnit >= 0xdc00 && codeUnit <= 0xdfff;
}

function proposalDeduplicationKey(proposal: AiTaskProposal): string {
  return JSON.stringify([
    normalizeName(proposal.name),
    proposal.prevision_date?.trim() ?? "",
    proposal.department ? normalizeName(proposal.department) : "",
    proposal.model ? normalizeName(proposal.model) : "",
  ]);
}

/** Remove apenas repetições de partes anteriores; duplicatas da mesma parte permanecem intactas. */
function deduplicateProposalsBetweenParts(parts: AiTaskProposal[][]): AiTaskProposal[] {
  const priorPartKeys = new Set<string>();
  const proposals: AiTaskProposal[] = [];

  for (const part of parts) {
    const keyedPart = part.map((proposal) => ({
      proposal,
      key: proposalDeduplicationKey(proposal),
    }));

    for (const { proposal, key } of keyedPart) {
      if (!priorPartKeys.has(key)) proposals.push(proposal);
    }
    for (const { key } of keyedPart) priorPartKeys.add(key);
  }

  return proposals;
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
  const name = normalizeTitle(proposal.name ?? "");
  if (!name) return null;

  const department = findUniqueByName(catalog, proposal.department);
  const model = department && findUniqueByName(department.tasksModel, proposal.model);
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
