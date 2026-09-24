import {
  internalReportingExtractBodySchema,
  internalReportingGrantSchema,
} from "@workspace/project-service/src/schemas/internalReporting.schemas.js";
import {
  integracaoProjectCreateBodySchema,
  integracaoProjectDeleteParamsSchema,
  integracaoProjectDetailQuerySchema,
  integracaoProjectListQuerySchema,
  integracaoProjectUpdateBodySchema,
} from "@workspace/project-service/src/schemas/projectCrud.schemas.js";
import { integracaoProjectMetricsQuerySchema } from "@workspace/project-service/src/schemas/projectMetrics.schemas.js";
import { integracaoProjectProgressBodySchema } from "@workspace/project-service/src/schemas/projectProgress.schemas.js";
import { type WorkerAuthContext, withWorkerPrisma } from "@workspace/runtime";
import {
  createProjectInTransaction,
  getProjectDeleteTasksMessage,
  PROJECT_DELETE_HIRING_MESSAGE,
  type ProjectCrudAuthContext,
  type ProjectReportingSource,
  parseWithZod,
  projectReportingCatalog,
  type ReportingQuery,
  reportingQueryFields,
  withReportingSnapshot,
} from "@workspace/shared";
import {
  INTEGRACAO_PERMISSION_LEVEL,
  type IntegracaoPermissionLevel,
  requireIntegracaoRouteAccess,
} from "@workspace/shared/auth";
import {
  createSuccessResponse,
  REQUEST_ID_HEADER,
  ServiceError,
  serializeError,
} from "@workspace/shared/http";
import type { MiddlewareHandler } from "hono";
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { authenticateProjectRequest } from "./auth.js";
import type { ProjectWorkerEnv } from "./env.js";
import { PrismaClient } from "./prisma.js";
import { executeProjectReportingQuery, getProjectReportingFields } from "./projectReporting.js";

export type { ProjectWorkerEnv } from "./env.js";

type ProjectRow = Record<string, unknown> & {
  id: string;
  name: string;
  client_id: string;
  status: string;
  start_date: Date | null;
  end_date: Date | null;
  objective: string | null;
  sponsor_id: string | null;
};
type TaskRow = { project_id: string; client_id: string; status: string };
type ProjectTransaction = Pick<ProjectPrisma, "client" | "project" | "task">;
type ProjectPrisma = {
  $disconnect(): Promise<void>;
  $transaction<T>(
    callback: (transaction: ProjectTransaction) => Promise<T>,
    options?: Record<string, unknown>,
  ): Promise<T>;
  project: {
    findMany(args: Record<string, unknown>): Promise<ProjectRow[]>;
    findFirst(args: Record<string, unknown>): Promise<ProjectRow | null>;
    create(args: Record<string, unknown>): Promise<ProjectRow>;
    update(args: Record<string, unknown>): Promise<ProjectRow>;
    delete(args: Record<string, unknown>): Promise<ProjectRow>;
  };
  client: {
    findFirst(args: {
      where: { id: string; organization_id: string };
      select: { id: true; type_registration: true; prospecting_status: true };
    }): Promise<{
      id: string;
      type_registration: string;
      prospecting_status: string;
    } | null>;
    findFirst(args: {
      where: Record<string, unknown>;
    }): Promise<({ id: string; service_unique?: boolean | null } & Record<string, unknown>) | null>;
    update(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  };
  task: {
    findMany(args: Record<string, unknown>): Promise<TaskRow[]>;
    groupBy(
      args: Record<string, unknown>,
    ): Promise<Array<{ status: string; _count: { status: number } }>>;
    count(args: { where: Record<string, unknown> }): Promise<number>;
  };
};

type ProjectAuthorization = ProjectCrudAuthContext & {
  integracaoLevel: IntegracaoPermissionLevel;
  isOwner: boolean;
};
type CreateProjectInput = ProjectAuthorization & {
  name: string;
  client_id: string;
  start_date: Date;
  end_date?: Date;
  objective: string;
  sponsor_id?: string;
};
type UpdateProjectInput = ProjectAuthorization & {
  project_id: string;
  name: string;
  start_date: Date;
  end_date: Date;
  objective: string;
  sponsor_id?: string;
};
type DeleteProjectInput = ProjectAuthorization & { project_id: string };

type ProjectAudit = {
  createLog(params: {
    userId: string;
    organizationId?: string | null;
    permission?: number | null;
    action: string;
    referring: string;
    referringId: string;
    changes: Record<string, unknown> | string;
  }): Promise<void>;
  logUpdateIfChanged(params: {
    userId: string;
    organizationId?: string | null;
    permission?: number | null;
    action: string;
    referring: string;
    referringId: string;
    oldData: Record<string, unknown> | null;
    updatedData: Record<string, unknown>;
  }): Promise<void>;
};

type ProjectCrudService = {
  create(input: CreateProjectInput): Promise<{ create: unknown }>;
  list(
    ref: "client" | "status" | "sponsor",
    id: string,
    organizationId: string,
    auth: ProjectAuthorization,
  ): Promise<unknown[]>;
  detail(
    projectId: string,
    organizationId: string,
    auth: ProjectAuthorization,
  ): Promise<{ detail: unknown }>;
  update(input: UpdateProjectInput): Promise<unknown>;
  delete(input: DeleteProjectInput): Promise<{ response: unknown }>;
};

type MetricsService = {
  getGlobalMetrics(
    organizationId: string,
    authorization: Pick<ProjectAuthorization, "userId" | "integracaoLevel" | "isOwner">,
  ): Promise<unknown>;
};
type ProgressService = {
  recalculateFromTasks(
    projectId: string,
    organizationId: string,
    authorization: Pick<ProjectAuthorization, "userId" | "integracaoLevel" | "isOwner">,
  ): Promise<unknown>;
};
type ReportingService = {
  extract(input: {
    query?: ReportingQuery;
    organizationId: string;
    source: ProjectReportingSource;
    fields: readonly string[];
    limit: number;
  }): Promise<{ rows: readonly Record<string, unknown>[]; reachedLimit: boolean }>;
};

type ProjectContext = {
  Bindings: ProjectWorkerEnv;
  Variables: { auth: WorkerAuthContext };
};
type ProjectOptions = {
  env?: ProjectWorkerEnv;
  prisma?: ProjectPrisma;
  projectService?: ProjectCrudService;
  metricsService?: MetricsService;
  progressService?: ProgressService;
  reportingService?: ReportingService;
};

const UPDATE_SELECT = {
  id: true,
  name: true,
  client_id: true,
  status: true,
  start_date: true,
  end_date: true,
  objective: true,
  sponsor_id: true,
  porcentage: true,
} as const;
const DETAIL_SELECT = {
  id: true,
  name: true,
  client_id: true,
  status: true,
  start_date: true,
  end_date: true,
  objective: true,
  sponsor_id: true,
  porcentage: true,
  client: {
    select: {
      id: true,
      name: true,
      company_name: true,
      fantasy_name: true,
      cpf_cnpj: true,
    },
  },
  tasks: {
    select: {
      id: true,
      name: true,
      status: true,
      observations: true,
      model_id: true,
      client_id: true,
      project_id: true,
      department: { select: { id: true, name: true } },
      taskModel: {
        select: {
          id: true,
          name: true,
          department: { select: { id: true, name: true } },
        },
      },
    },
  },
} as const;
const TASK_STATUSES_FOR_PROGRESS = [
  "Em andamento",
  "Em Andamento",
  "A Realizar",
  "Em Espera",
  "Concluída",
] as const;

function authorization(auth: WorkerAuthContext): ProjectAuthorization {
  if (auth.actorKind !== "organization" || !auth.organizationId) {
    throw new ServiceError(403, "Organização não informada.");
  }
  return {
    userId: auth.userId,
    organizationId: auth.organizationId,
    permission: auth.claims.permission,
    integracaoLevel: auth.claims.modules.integracao,
    isOwner: auth.claims.type === "owner",
  };
}

function isPrismaError(error: unknown, ...codes: string[]): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    codes.includes(error.code)
  );
}

function isSerializationConflict(error: unknown): boolean {
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? String(error.message)
      : String(error);
  return /could not serialize access|serialization failure|deadlock detected/iu.test(message);
}

function isProjectConflict(error: unknown): boolean {
  return isPrismaError(error, "P2002", "P2025", "P2034") || isSerializationConflict(error);
}

function projectDetailForUi(detail: ProjectRow): ProjectRow {
  const tasks = detail.tasks;
  if (!Array.isArray(tasks)) return detail;
  return {
    ...detail,
    tasks: tasks.map((task) => {
      if (!task || typeof task !== "object") return task;
      const row = task as Record<string, unknown>;
      return { ...row, model: row.taskModel ?? null };
    }),
  };
}

function recordAuditPayload(params: {
  userId: string;
  organizationId?: string | null;
  permission?: number | null;
  action: string;
  referring: string;
  referringId: string;
  changes: Record<string, unknown> | string;
}): Record<string, unknown> {
  const now = new Date().toISOString();
  return {
    requestId: crypto.randomUUID(),
    organizationId: params.organizationId ?? null,
    userId: params.userId,
    permission: params.permission ?? null,
    method: "ENTITY_CHANGE",
    path: `/${params.referring.replace(/\./g, "/")}`,
    outcome: "success",
    serviceSource: "project-service",
    createdAt: now,
    finishedAt: now,
    action: params.action,
    referring: params.referring,
    referringId: params.referringId,
    changes: params.changes,
  };
}

async function sendAudit(env: ProjectWorkerEnv, payload: Record<string, unknown>): Promise<void> {
  if (!env.AUDIT_SERVICE || !env.AUDIT_SERVICE_TOKEN) return;
  try {
    await env.AUDIT_SERVICE.fetch(
      new Request("https://audit-service/internal/audit/requests", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-internal-service-token": env.AUDIT_SERVICE_TOKEN,
        },
        body: JSON.stringify(payload),
      }),
    );
  } catch {
    // Auditoria permanece best-effort, como no recorder PostgreSQL atual.
  }
}

function createProjectAudit(env: ProjectWorkerEnv): ProjectAudit {
  return {
    createLog: async (params) => sendAudit(env, recordAuditPayload(params)),
    logUpdateIfChanged: async (params) => {
      const changes: Record<string, { from: unknown; to: unknown }> = {};
      for (const key of Object.keys(params.updatedData)) {
        const from = params.oldData?.[key];
        const to = params.updatedData[key];
        if (from !== to) changes[key] = { from, to };
      }
      await sendAudit(
        env,
        recordAuditPayload({
          userId: params.userId,
          organizationId: params.organizationId,
          permission: params.permission,
          action: params.action,
          referring: params.referring,
          referringId: params.referringId,
          changes,
        }),
      );
    },
  };
}

function localCrudService(prisma: ProjectPrisma, audit: ProjectAudit): ProjectCrudService {
  return {
    async create(data) {
      try {
        // O schema canônico não tem unique físico para a identidade do projeto;
        // o precheck e o insert permanecem no mesmo snapshot serializável.
        const result = await prisma.$transaction(
          (transaction) => createProjectInTransaction(data, transaction),
          { isolationLevel: "Serializable" },
        );
        await audit.createLog({
          userId: data.userId,
          organizationId: data.organizationId,
          permission: data.permission ?? null,
          action: "Cadastro",
          referring: "integracao.projects",
          referringId: result.create.id,
          changes: "{}",
        });
        return result;
      } catch (error) {
        if (isPrismaError(error, "P2002", "P2034")) {
          throw new ServiceError(409, "Um objetivo com esse nome nesse cliente já foi cadastrado.");
        }
        throw error;
      }
    },
    async list(ref, id, organizationId, auth) {
      requireIntegracaoRouteAccess("GET", "/project/list", {
        userId: auth.userId,
        level: auth.integracaoLevel,
        organizationId,
        isOwner: auth.isOwner,
      });
      const field = ref === "client" ? "client_id" : ref === "sponsor" ? "sponsor_id" : "status";
      return prisma.project.findMany({
        where: { [field]: id, organization_id: organizationId },
        orderBy: { start_date: ref === "client" ? "desc" : "asc" },
      });
    },
    async detail(projectId, organizationId, auth) {
      const detail = await prisma.project.findFirst({
        where: { id: projectId, organization_id: organizationId },
        select: DETAIL_SELECT,
      });
      if (!detail) throw new ServiceError(404, "Projeto não existe");
      requireIntegracaoRouteAccess("GET", "/project", {
        userId: auth.userId,
        level: auth.integracaoLevel,
        organizationId,
        resourceOrganizationId: organizationId,
        isOwner: auth.isOwner,
      });
      return { detail: projectDetailForUi(detail) };
    },
    async update(data) {
      try {
        const exists = await prisma.project.findFirst({
          where: { id: data.project_id, organization_id: data.organizationId },
        });
        if (!exists) throw new ServiceError(404, "Projeto não existe");
        requireIntegracaoRouteAccess("PUT", "/project", {
          userId: data.userId,
          level: data.integracaoLevel,
          organizationId: data.organizationId,
          resourceOrganizationId: data.organizationId,
          isOwner: data.isOwner,
          requestedFields: ["name", "start_date", "end_date", "objective", "sponsor_id"],
        });
        const updated = await prisma.project.update({
          where: { id: data.project_id },
          data: {
            name: data.name,
            start_date: data.start_date,
            end_date: data.end_date,
            objective: data.objective,
            sponsor_id: data.sponsor_id ?? null,
          },
          select: UPDATE_SELECT,
        });
        await audit.logUpdateIfChanged({
          userId: data.userId,
          organizationId: data.organizationId,
          permission: data.permission ?? null,
          action: "Atualização",
          referring: "integracao.projects",
          referringId: data.project_id,
          oldData: exists,
          updatedData: updated,
        });
        return updated;
      } catch (error) {
        if (error instanceof ServiceError) throw error;
        if (isProjectConflict(error)) {
          throw new ServiceError(409, "Conflito ao atualizar o projeto. Tente novamente.", error);
        }
        throw new ServiceError(500, "Erro ao atualizar", error);
      }
    },
    async delete(data) {
      const exists = await prisma.project.findFirst({
        where: { id: data.project_id, organization_id: data.organizationId },
      });
      if (!exists) throw new ServiceError(404, "Projeto não existe");
      requireIntegracaoRouteAccess("DELETE", "/project", {
        userId: data.userId,
        level: data.integracaoLevel,
        organizationId: data.organizationId,
        resourceOrganizationId: data.organizationId,
        isOwner: data.isOwner,
      });
      const taskCount = await prisma.task.count({
        where: { project_id: data.project_id, organization_id: data.organizationId },
      });
      if (taskCount > 0) {
        throw new ServiceError(409, getProjectDeleteTasksMessage(taskCount));
      }
      try {
        const response = await prisma.project.delete({ where: { id: data.project_id } });
        await audit.createLog({
          userId: data.userId,
          organizationId: data.organizationId,
          action: "Exclusão",
          referring: "integracao.projects",
          referringId: data.project_id,
          changes: "{}",
        });
        return { response };
      } catch (error) {
        if (isPrismaError(error, "P2003")) {
          throw new ServiceError(409, PROJECT_DELETE_HIRING_MESSAGE);
        }
        if (isPrismaError(error, "P2025")) return { response: null };
        if (isProjectConflict(error)) {
          throw new ServiceError(409, "Conflito ao excluir o projeto. Tente novamente.", error);
        }
        throw error;
      }
    },
  };
}

const normalizeStatus = (status: string | null | undefined) =>
  status?.trim().toLocaleLowerCase("pt-BR") ?? "";
const PROJECT_STATUS_TO_DO = new Set([
  "análise/agendamento",
  "análise financeira",
  "envio de proposta",
]);

function calculateMetrics(projects: ProjectRow[], tasks: TaskRow[]) {
  const result = {
    total: projects.length,
    completed: 0,
    inProgress: 0,
    paused: 0,
    toDo: 0,
    notContracted: 0,
    taskMetrics: { total: tasks.length, completed: 0, open: 0, paused: 0, emptyStatus: 0 },
  };
  for (const task of tasks) {
    const status = normalizeStatus(task.status);
    if (!status) result.taskMetrics.emptyStatus += 1;
    else if (status === "concluída") result.taskMetrics.completed += 1;
    else if (status === "paralisado") result.taskMetrics.paused += 1;
    else result.taskMetrics.open += 1;
  }
  const projectTasks = new Map<string, TaskRow[]>();
  const clientTasks = new Map<string, TaskRow[]>();
  for (const task of tasks) {
    projectTasks.set(task.project_id, [...(projectTasks.get(task.project_id) ?? []), task]);
    clientTasks.set(task.client_id, [...(clientTasks.get(task.client_id) ?? []), task]);
  }
  for (const project of projects) {
    const status = normalizeStatus(project.status);
    const related = projectTasks.get(project.id) ?? clientTasks.get(project.client_id) ?? [];
    if (PROJECT_STATUS_TO_DO.has(status)) result.toDo += 1;
    else if (status === "paralisado") result.paused += 1;
    else if (status === "recusado pelo cliente") result.notContracted += 1;
    else if (status === "concluído") result.completed += 1;
    else if (status === "em andamento") result.inProgress += 1;
    else if (status === "fechado") {
      const hasOpen = related.some((task) => {
        const taskStatus = normalizeStatus(task.status);
        return taskStatus !== "" && taskStatus !== "concluída" && taskStatus !== "paralisado";
      });
      if (hasOpen) result.inProgress += 1;
      else if (
        related.length > 0 &&
        related.some((task) => normalizeStatus(task.status) === "concluída")
      ) {
        result.completed += 1;
      }
    } else if (
      status === "distrato" &&
      related.some((task) => {
        const taskStatus = normalizeStatus(task.status);
        return taskStatus !== "" && taskStatus !== "concluída";
      })
    ) {
      result.completed += 1;
    }
  }
  return result;
}

function localMetricsService(prisma: ProjectPrisma): MetricsService {
  return {
    async getGlobalMetrics(organizationId, auth) {
      try {
        requireIntegracaoRouteAccess("GET", "/project/metrics", {
          userId: auth.userId,
          level: auth.integracaoLevel,
          organizationId,
          isOwner: auth.isOwner,
        });
        const projects = await prisma.project.findMany({
          where: { organization_id: organizationId },
          select: { id: true, client_id: true, status: true },
        });
        const projectIds = projects.map((project) => project.id);
        const clientIds = [...new Set(projects.map((project) => project.client_id))];
        const tasks =
          projectIds.length || clientIds.length
            ? await prisma.task.findMany({
                where: {
                  organization_id: organizationId,
                  OR: [{ project_id: { in: projectIds } }, { client_id: { in: clientIds } }],
                },
                select: { project_id: true, client_id: true, status: true },
              })
            : [];
        return calculateMetrics(projects, tasks);
      } catch (error) {
        if (error instanceof ServiceError) throw error;
        throw new ServiceError(500, "Erro ao calcular métricas globais de projetos.", error);
      }
    },
  };
}

function localProgressService(prisma: ProjectPrisma, audit: ProjectAudit): ProgressService {
  return {
    async recalculateFromTasks(projectId, organizationId, auth) {
      try {
        const outcome = await prisma.$transaction(
          async (transaction) => {
            const exists = await transaction.project.findFirst({
              where: { id: projectId, organization_id: organizationId },
              select: { id: true, client_id: true },
            });
            if (!exists) throw new ServiceError(404, "Projeto não existe");
            requireIntegracaoRouteAccess("POST", "/project/progress", {
              userId: auth.userId,
              level: auth.integracaoLevel,
              organizationId,
              resourceOrganizationId: organizationId,
              isOwner: auth.isOwner,
              requestedFields: ["project_id"],
            });
            const statusCounts = await transaction.task.groupBy({
              by: ["status"],
              where: {
                project_id: projectId,
                organization_id: organizationId,
                status: { in: [...TASK_STATUSES_FOR_PROGRESS] },
              },
              _count: { status: true },
            });
            if (statusCounts.length === 0) {
              return {
                project: await transaction.project.update({
                  where: { id: projectId },
                  data: { porcentage: 0 },
                  select: { id: true, status: true, porcentage: true, client_id: true },
                }),
                status: null,
                percentage: 0,
              };
            }
            const totalTasks = statusCounts.reduce((sum, group) => sum + group._count.status, 0);
            const completedTasks =
              statusCounts.find((group) => group.status === "Concluída")?._count.status ?? 0;
            const percentage = Math.round((completedTasks / totalTasks) * 100 * 100) / 100;
            const newStatus = percentage === 100 ? "Concluído" : "Em andamento";
            if (
              percentage === 100 &&
              auth.integracaoLevel !== INTEGRACAO_PERMISSION_LEVEL.ADMIN &&
              !auth.isOwner
            ) {
              throw new ServiceError(403, "Acesso negado para inativar o cliente pelo progresso.");
            }
            const updated = await transaction.project.update({
              where: { id: projectId },
              data: { status: newStatus, porcentage: percentage },
              select: { id: true, status: true, porcentage: true, client_id: true },
            });
            if (percentage === 100) {
              const client = await transaction.client.findFirst({
                where: { id: exists.client_id, organization_id: organizationId },
              });
              if (!client) throw new ServiceError(404, "Cliente não existe");
              if (client.service_unique === true) {
                await transaction.client.update({
                  where: { id: exists.client_id },
                  data: { status: "Inativo", deletion_date: new Date() },
                });
              }
            }
            return { project: updated, status: newStatus, percentage };
          },
          { isolationLevel: "RepeatableRead" },
        );
        await audit.createLog({
          userId: auth.userId,
          organizationId,
          action: "Atualização de progresso",
          referring: "integracao.projects",
          referringId: projectId,
          changes: {
            ...(outcome.status ? { status: outcome.status } : {}),
            porcentage: outcome.percentage,
          },
        });
        return { project: outcome.project };
      } catch (error) {
        if (error instanceof ServiceError) throw error;
        throw new ServiceError(500, "Erro ao recalcular progresso do projeto.", error);
      }
    },
  };
}

type ReportingPrisma = {
  $transaction<T>(
    callback: (transaction: ReportingPrisma) => Promise<T>,
    options?: Record<string, unknown>,
  ): Promise<T>;
  project: {
    findMany(args: {
      where: { organization_id: string };
      select: Record<string, true>;
      take: number;
      skip?: number;
      orderBy?: { id: "asc" };
    }): Promise<readonly Record<string, unknown>[]>;
  };
};

async function extractReporting(
  prisma: ReportingPrisma,
  input: {
    query?: ReportingQuery;
    offset?: number;
    organizationId: string;
    source: ProjectReportingSource;
    fields: readonly string[];
    limit: number;
  },
  inSnapshot = false,
): Promise<{ rows: readonly Record<string, unknown>[]; reachedLimit: boolean }> {
  if (input.query && !inSnapshot) {
    return withReportingSnapshot(prisma, (transaction) =>
      extractReporting(transaction, input, true),
    );
  }
  if (input.query) {
    return executeProjectReportingQuery({ ...input, query: input.query }, (fields, limit, offset) =>
      extractReporting(prisma, { ...input, query: undefined, fields, limit, offset }, true),
    );
  }
  const allowedFields = getProjectReportingFields(input.source);
  if (input.fields.some((field) => !allowedFields.includes(field))) {
    throw new ServiceError(403, "Campo não publicado para relatórios.");
  }
  const rows = await prisma.project.findMany({
    where: { organization_id: input.organizationId },
    select: Object.fromEntries(input.fields.map((field) => [field, true])),
    ...(input.offset !== undefined ? { skip: input.offset, orderBy: { id: "asc" } as const } : {}),
    take: input.limit + 1,
  });
  return { rows: rows.slice(0, input.limit), reachedLimit: rows.length > input.limit };
}

function localReportingService(prisma: ReportingPrisma): ReportingService {
  return { extract: (input) => extractReporting(prisma, input) };
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
}

function decodeBase64Url(value: string): string {
  const padded = value
    .replace(/-/gu, "+")
    .replace(/_/gu, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

function equalText(left: string | undefined, right: string): boolean {
  if (!left) return false;
  const actual = new TextEncoder().encode(left);
  const expected = new TextEncoder().encode(right);
  let difference = actual.length ^ expected.length;
  for (let index = 0; index < Math.max(actual.length, expected.length); index += 1) {
    difference |= (actual[index] ?? 0) ^ (expected[index] ?? 0);
  }
  return difference === 0;
}

async function digestHex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hmacHex(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

async function verifyGrant(input: {
  env: ProjectWorkerEnv;
  token: string | undefined;
  grant: string | undefined;
  signature: string | undefined;
  requestId: string;
  operation: "catalog" | "extract";
  source: string;
  fields: readonly string[];
  body: unknown;
}) {
  if (!equalText(input.token, input.env.REPORTS_INTERNAL_TOKEN)) {
    throw new ServiceError(403, "Acesso negado.");
  }
  if (!input.grant) throw new ServiceError(403, "Grant de relatórios inválido.");
  let payload: ReturnType<typeof internalReportingGrantSchema.parse>;
  try {
    payload = internalReportingGrantSchema.parse(JSON.parse(decodeBase64Url(input.grant)));
    if (!equalText(base64Url(new TextEncoder().encode(canonicalJson(payload))), input.grant)) {
      throw new Error("non-canonical grant");
    }
  } catch {
    throw new ServiceError(403, "Grant de relatórios inválido.");
  }
  if (!equalText(input.signature, await hmacHex(input.grant, input.env.REPORTS_GRANT_SECRET))) {
    throw new ServiceError(403, "Grant de relatórios inválido.");
  }
  const now = Math.floor(Date.now() / 1000);
  const fieldsMatch =
    payload.fields.length === input.fields.length &&
    payload.fields.every((field, index) => field === input.fields[index]);
  if (
    payload.operation !== input.operation ||
    payload.source !== input.source ||
    !fieldsMatch ||
    payload.request_id !== input.requestId ||
    payload.body_sha256 !== (await digestHex(canonicalJson(input.body))) ||
    payload.issued_at > now ||
    payload.expires_at <= now
  ) {
    throw new ServiceError(403, "Grant de relatórios inválido.");
  }
  return payload;
}

async function jsonBody(c: { req: { json<T>(): Promise<T> } }): Promise<unknown> {
  try {
    return await c.req.json<unknown>();
  } catch {
    throw new ServiceError(400, "JSON inválido.");
  }
}

async function optionalJsonBody(c: {
  req: { header(name: string): string | undefined; json<T>(): Promise<T>; raw: Request };
}): Promise<Record<string, unknown>> {
  const contentType = c.req.header("content-type") ?? "";
  if (!contentType.includes("application/json")) return {};
  const contentLength = c.req.header("content-length");
  if (contentLength === "0" || !c.req.raw.body) return {};
  const body = await jsonBody(c);
  return body && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};
}

function runWithPrisma<T>(
  c: { env: ProjectWorkerEnv },
  options: ProjectOptions,
  callback: (prisma: ProjectPrisma) => Promise<T> | T,
): Promise<T> {
  if (options.prisma) return Promise.resolve(callback(options.prisma));
  const env = options.env ?? c.env;
  if (!env.HYPERDRIVE?.connectionString && !env.DATABASE_URL) {
    throw new ServiceError(
      503,
      "Banco de dados indisponível: configure o binding HYPERDRIVE ou o secret DATABASE_URL.",
    );
  }
  return withWorkerPrisma(env, PrismaClient, (client) =>
    callback(client as unknown as ProjectPrisma),
  );
}

export function createProjectWorkerApp(options: ProjectOptions = {}) {
  const app = new Hono<ProjectContext>();
  app.get("/health", (c) =>
    c.json(createSuccessResponse({ status: "ok", service: "project-service" })),
  );
  app.get("/ready", (c) =>
    c.json(createSuccessResponse({ status: "ready", service: "project-service" })),
  );
  const authMiddleware: MiddlewareHandler<ProjectContext> = async (c, next) => {
    c.set("auth", await authenticateProjectRequest(c.req.raw, options.env ?? c.env));
    await next();
  };
  app.use("/project/*", authMiddleware);

  app.get("/internal/reporting/catalog", async (c) => {
    await verifyGrant({
      env: options.env ?? c.env,
      token: c.req.header("x-internal-service-token"),
      grant: c.req.header("x-reports-grant"),
      signature: c.req.header("x-reports-grant-signature"),
      requestId: c.req.header(REQUEST_ID_HEADER) ?? "",
      operation: "catalog",
      source: "integracao.catalog",
      fields: [],
      body: {},
    });
    return c.json(createSuccessResponse(projectReportingCatalog));
  });

  app.post("/internal/reporting/extract", async (c) => {
    const body = parseWithZod(internalReportingExtractBodySchema, await jsonBody(c));
    const grant = await verifyGrant({
      env: options.env ?? c.env,
      token: c.req.header("x-internal-service-token"),
      grant: c.req.header("x-reports-grant"),
      signature: c.req.header("x-reports-grant-signature"),
      requestId: c.req.header(REQUEST_ID_HEADER) ?? "",
      operation: "extract",
      source: body.source,
      fields: reportingQueryFields(body.fields, body.query),
      body,
    });
    const invoke = (reporting: ReportingService) =>
      reporting.extract({
        organizationId: grant.organization_id,
        source: body.source,
        fields: body.fields,
        limit: body.limit,
        ...(body.query ? { query: body.query } : {}),
      });
    const result = options.reportingService
      ? await invoke(options.reportingService)
      : await runWithPrisma(c, options, (prisma) =>
          invoke(localReportingService(prisma as unknown as ReportingPrisma)),
        );
    return c.json(createSuccessResponse(result));
  });

  app.get("/project/list", async (c) => {
    const query = parseWithZod(integracaoProjectListQuerySchema, c.req.query());
    const auth = authorization(c.get("auth"));
    const invoke = (service: ProjectCrudService) =>
      service.list(query.ref, query.id, auth.organizationId, auth);
    const result = options.projectService
      ? await invoke(options.projectService)
      : await runWithPrisma(c, options, (prisma) =>
          invoke(localCrudService(prisma, createProjectAudit(options.env ?? c.env))),
        );
    return c.json(createSuccessResponse(result));
  });

  app.get("/project", async (c) => {
    const query = parseWithZod(integracaoProjectDetailQuerySchema, c.req.query());
    const auth = authorization(c.get("auth"));
    const invoke = (service: ProjectCrudService) =>
      service.detail(query.project_id, auth.organizationId, auth);
    const result = options.projectService
      ? await invoke(options.projectService)
      : await runWithPrisma(c, options, (prisma) =>
          invoke(localCrudService(prisma, createProjectAudit(options.env ?? c.env))),
        );
    return c.json(createSuccessResponse(result));
  });

  app.post("/project", async (c) => {
    const body = parseWithZod(integracaoProjectCreateBodySchema, await jsonBody(c));
    const auth = authorization(c.get("auth"));
    const invoke = (service: ProjectCrudService) => service.create({ ...body, ...auth });
    const result = options.projectService
      ? await invoke(options.projectService)
      : await runWithPrisma(c, options, (prisma) =>
          invoke(localCrudService(prisma, createProjectAudit(options.env ?? c.env))),
        );
    return c.json(createSuccessResponse(result), 201);
  });

  app.put("/project", async (c) => {
    const body = parseWithZod(integracaoProjectUpdateBodySchema, await jsonBody(c));
    const auth = authorization(c.get("auth"));
    const invoke = (service: ProjectCrudService) => service.update({ ...body, ...auth });
    const result = options.projectService
      ? await invoke(options.projectService)
      : await runWithPrisma(c, options, (prisma) =>
          invoke(localCrudService(prisma, createProjectAudit(options.env ?? c.env))),
        );
    return c.json(createSuccessResponse(result));
  });

  app.delete("/project", async (c) => {
    const body = await optionalJsonBody(c);
    const input = parseWithZod(integracaoProjectDeleteParamsSchema, {
      project_id: body.project_id ?? c.req.query("project_id"),
    });
    const auth = authorization(c.get("auth"));
    const invoke = (service: ProjectCrudService) => service.delete({ ...input, ...auth });
    const result = options.projectService
      ? await invoke(options.projectService)
      : await runWithPrisma(c, options, (prisma) =>
          invoke(localCrudService(prisma, createProjectAudit(options.env ?? c.env))),
        );
    return c.json(createSuccessResponse(result));
  });

  app.get("/project/metrics", async (c) => {
    parseWithZod(integracaoProjectMetricsQuerySchema, c.req.query());
    const auth = authorization(c.get("auth"));
    const input = {
      userId: auth.userId,
      integracaoLevel: auth.integracaoLevel,
      isOwner: auth.isOwner,
    };
    const invoke = (service: MetricsService) =>
      service.getGlobalMetrics(auth.organizationId, input);
    const result = options.metricsService
      ? await invoke(options.metricsService)
      : await runWithPrisma(c, options, (prisma) => invoke(localMetricsService(prisma)));
    return c.json(createSuccessResponse(result));
  });

  app.post("/project/progress", async (c) => {
    const body = parseWithZod(integracaoProjectProgressBodySchema, await jsonBody(c));
    const auth = authorization(c.get("auth"));
    const input = {
      userId: auth.userId,
      integracaoLevel: auth.integracaoLevel,
      isOwner: auth.isOwner,
    };
    const invoke = (service: ProgressService) =>
      service.recalculateFromTasks(body.project_id, auth.organizationId, input);
    const result = options.progressService
      ? await invoke(options.progressService)
      : await runWithPrisma(c, options, (prisma) =>
          invoke(localProgressService(prisma, createProjectAudit(options.env ?? c.env))),
        );
    return c.json(createSuccessResponse(result));
  });

  app.onError((error, c) => {
    const normalizedError =
      error instanceof ServiceError
        ? error
        : typeof error === "object" &&
            error !== null &&
            "statusCode" in error &&
            typeof error.statusCode === "number" &&
            "message" in error &&
            typeof error.message === "string"
          ? new ServiceError(error.statusCode, error.message)
          : error;
    const serialized = serializeError(normalizedError, {
      requestId: c.req.header(REQUEST_ID_HEADER),
      fallbackMessage: "Erro interno no project-service.",
    });
    return c.json(serialized.body, serialized.statusCode as ContentfulStatusCode);
  });
  app.notFound((c) =>
    c.json({ success: false, error: "Recurso não encontrado.", code: "NOT_FOUND" }, 404),
  );
  return app;
}
