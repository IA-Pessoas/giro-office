import {
  INTEGRACAO_PERMISSION_LEVEL,
  type IntegracaoPermissionLevel,
  requireIntegracaoRouteAccess,
} from "../auth/integracao.js";
import { ServiceError } from "../http/errors.js";

export interface ProjectCrudAuthContext {
  userId: string;
  organizationId: string;
  permission?: number;
  integracaoLevel?: IntegracaoPermissionLevel;
  isOwner?: boolean;
}

export interface CreateProjectCrudRequest extends ProjectCrudAuthContext {
  name: string;
  client_id: string;
  start_date: Date;
  end_date?: Date;
  objective: string;
  sponsor_id?: string;
}

export interface ProjectCreateRow {
  id: string;
  name: string;
  client_id: string;
  status: string;
  start_date: Date | null;
  end_date: Date | null;
  objective: string | null;
  sponsor_id: string | null;
}

export const PROJECT_STATUS_WAITING_COMMERCIAL = "Aguardando liberação do Comercial";
export const PROJECT_STATUS_TO_DO = "A realizar";
export const PROJECT_STATUS_IN_PROGRESS = "Em andamento";
export const PROJECT_STATUS_PAUSED = "Paralisado";
export const PROJECT_STATUS_COMPLETED = "Concluído";

/** Status que o usuário pode escolher na edição do projeto. */
export const PROJECT_MANUAL_STATUSES = [
  PROJECT_STATUS_IN_PROGRESS,
  PROJECT_STATUS_PAUSED,
  PROJECT_STATUS_COMPLETED,
] as const;

const SAO_PAULO_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" });

/** Cliente novo em prospecção espera o Comercial; início futuro nasce "A realizar". */
export function getInitialProjectStatus(
  client: { type_registration: string | null; prospecting_status: string | null },
  startDate: Date,
  now: Date = new Date(),
): string {
  if (client.type_registration === "Novo" && client.prospecting_status !== "Fechado") {
    return PROJECT_STATUS_WAITING_COMMERCIAL;
  }
  // start_date é data civil gravada à meia-noite UTC; "hoje" é o dia em São Paulo.
  return startDate.toISOString().slice(0, 10) > SAO_PAULO_DAY.format(now)
    ? PROJECT_STATUS_TO_DO
    : PROJECT_STATUS_IN_PROGRESS;
}

/**
 * Transição manual pela edição. Concluir exige todas as tarefas concluídas e o mesmo
 * nível do fechamento por progresso (ADMIN ou owner).
 */
export function resolveManualProjectStatus(
  current: string,
  requested: string | undefined,
  openTaskCount: number,
  canComplete: boolean,
): string {
  if (requested === undefined || requested === current) return current;
  if (current === PROJECT_STATUS_WAITING_COMMERCIAL) {
    throw new ServiceError(409, "O projeto aguarda liberação do Comercial.");
  }
  if (!(PROJECT_MANUAL_STATUSES as readonly string[]).includes(requested)) {
    throw new ServiceError(400, `Status inválido: ${requested}.`);
  }
  if (requested === PROJECT_STATUS_COMPLETED && !canComplete) {
    throw new ServiceError(403, "Somente administradores podem concluir o projeto.");
  }
  if (requested === PROJECT_STATUS_COMPLETED && openTaskCount > 0) {
    throw new ServiceError(
      409,
      `Não é possível concluir o projeto: há ${openTaskCount} tarefa(s) em aberto.`,
    );
  }
  return requested;
}

/** Recalculo de progresso: 100% conclui; abaixo disso, pausa manual é preservada. */
export function getProgressProjectStatus(current: string, percentage: number): string {
  if (percentage === 100) return PROJECT_STATUS_COMPLETED;
  return current === PROJECT_STATUS_PAUSED ? PROJECT_STATUS_PAUSED : PROJECT_STATUS_IN_PROGRESS;
}

/** Tarefas bloqueiam a exclusão do projeto; a regra da tarefa decide o que cai em cascata. */
export function getProjectDeleteTasksMessage(taskCount: number): string {
  return `Não é possível excluir o projeto: ele tem ${taskCount} tarefa(s) vinculada(s). Exclua as tarefas antes.`;
}

/** Com as tarefas já checadas, a única FK restante que bloqueia é a contratação de plano. */
export const PROJECT_DELETE_HIRING_MESSAGE =
  "Não é possível excluir o projeto: há contratação de plano vinculada a ele.";

const CREATE_SELECT = {
  id: true,
  name: true,
  client_id: true,
  status: true,
  start_date: true,
  end_date: true,
  objective: true,
  sponsor_id: true,
} as const;

/** Compatível com os TransactionClient gerados por cada serviço, sem importar seus clients. */
export interface ProjectCreationTransaction {
  client: {
    findFirst(args: {
      where: { id: string; organization_id: string };
      select: { id: true; type_registration: true; prospecting_status: true };
    }): Promise<{
      id: string;
      type_registration: string;
      prospecting_status: string;
    } | null>;
  };
  project: {
    findFirst(args: {
      where: { name: string; client_id: string; organization_id: string };
    }): Promise<{ id: string } | null>;
    create(args: {
      data: Omit<ProjectCreateRow, "id"> & { organization_id: string; porcentage: number };
      select: typeof CREATE_SELECT;
    }): Promise<ProjectCreateRow>;
  };
}

/** O chamador controla commit/rollback e os efeitos após o commit. */
export async function createProjectInTransaction(
  data: CreateProjectCrudRequest,
  tx: ProjectCreationTransaction,
): Promise<{ create: ProjectCreateRow }> {
  requireIntegracaoRouteAccess("POST", "/project", {
    userId: data.userId,
    level: data.integracaoLevel ?? INTEGRACAO_PERMISSION_LEVEL.BASIC,
    organizationId: data.organizationId,
    resourceOrganizationId: data.organizationId,
    isOwner: data.isOwner === true,
    requestedFields: ["name", "client_id", "start_date", "end_date", "objective", "sponsor_id"],
  });

  if (data.end_date && data.end_date < data.start_date) {
    throw new ServiceError(400, "A data final não pode ser anterior à data inicial.");
  }

  const client = await tx.client.findFirst({
    where: { id: data.client_id, organization_id: data.organizationId },
    select: { id: true, type_registration: true, prospecting_status: true },
  });
  if (!client) {
    throw new ServiceError(404, "Cliente não encontrado.");
  }

  const duplicate = await tx.project.findFirst({
    where: {
      name: data.name,
      client_id: data.client_id,
      organization_id: data.organizationId,
    },
  });
  if (duplicate !== null) {
    throw new ServiceError(409, "Um objetivo com esse nome nesse cliente já foi cadastrada");
  }

  const create = await tx.project.create({
    data: {
      name: data.name,
      client_id: data.client_id,
      organization_id: data.organizationId,
      status: getInitialProjectStatus(client, data.start_date),
      start_date: data.start_date,
      end_date: data.end_date ?? null,
      objective: data.objective,
      sponsor_id: data.sponsor_id ?? null,
      porcentage: 0,
    },
    select: CREATE_SELECT,
  });
  return { create };
}
