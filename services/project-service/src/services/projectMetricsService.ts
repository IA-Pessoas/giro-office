import {
  INTEGRACAO_PERMISSION_LEVEL,
  type IntegracaoPermissionLevel,
  error as logError,
  requireIntegracaoRouteAccess,
  ServiceError,
} from "@workspace/shared";

import prismaClient from "../integrations/prisma.js";

const PROJECT_STATUS_TO_DO = new Set([
  "análise/agendamento",
  "análise financeira",
  "envio de proposta",
]);
const PROJECT_STATUS_PAUSED = "paralisado";
const PROJECT_STATUS_NOT_CONTRACTED = "recusado pelo cliente";
const PROJECT_STATUS_CLOSED = "fechado";
const PROJECT_STATUS_TERMINATED = "distrato";
const PROJECT_STATUS_COMPLETED = "concluído";
const PROJECT_STATUS_IN_PROGRESS = "em andamento";

const TASK_STATUS_COMPLETED = "concluída";
const TASK_STATUS_PAUSED = "paralisado";

type ProjectMetricsProject = {
  id: string;
  client_id: string;
  status: string;
};

type ProjectMetricsTask = {
  project_id: string;
  client_id: string;
  status: string;
};

export type ProjectMetricsResult = {
  total: number;
  completed: number;
  inProgress: number;
  paused: number;
  toDo: number;
  notContracted: number;
  taskMetrics: {
    total: number;
    completed: number;
    open: number;
    paused: number;
    emptyStatus: number;
  };
};

export type ProjectMetricsPrisma = typeof prismaClient;

export interface ProjectMetricsAuthorization {
  userId: string;
  integracaoLevel?: IntegracaoPermissionLevel;
  isOwner?: boolean;
}

function normalizeStatus(status: string | null | undefined): string {
  return status?.trim().toLocaleLowerCase("pt-BR") ?? "";
}

function hasOpenRelevantTask(tasks: ProjectMetricsTask[]): boolean {
  return tasks.some((task) => {
    const status = normalizeStatus(task.status);
    return status !== "" && status !== TASK_STATUS_COMPLETED && status !== TASK_STATUS_PAUSED;
  });
}

function hasCompletedTask(tasks: ProjectMetricsTask[]): boolean {
  return tasks.some((task) => normalizeStatus(task.status) === TASK_STATUS_COMPLETED);
}

function hasNonCompletedTaskWithStatus(tasks: ProjectMetricsTask[]): boolean {
  return tasks.some((task) => {
    const status = normalizeStatus(task.status);
    return status !== "" && status !== TASK_STATUS_COMPLETED;
  });
}

export class ProjectMetricsService {
  constructor(private readonly prisma: ProjectMetricsPrisma = prismaClient) {}

  async getGlobalMetrics(
    organizationId: string,
    authorization: ProjectMetricsAuthorization = { userId: "" },
  ): Promise<ProjectMetricsResult> {
    try {
      requireIntegracaoRouteAccess("GET", "/project/metrics", {
        userId: authorization.userId,
        level: authorization.integracaoLevel ?? INTEGRACAO_PERMISSION_LEVEL.BASIC,
        organizationId,
        isOwner: authorization.isOwner === true,
      });

      const projects = await this.prisma.project.findMany({
        where: { organization_id: organizationId },
        select: {
          id: true,
          client_id: true,
          status: true,
        },
      });

      const projectIds = projects.map((project) => project.id);
      const clientIds = [...new Set(projects.map((project) => project.client_id))];
      const tasks =
        projectIds.length > 0 || clientIds.length > 0
          ? await this.prisma.task.findMany({
              where: {
                organization_id: organizationId,
                OR: [{ project_id: { in: projectIds } }, { client_id: { in: clientIds } }],
              },
              select: {
                project_id: true,
                client_id: true,
                status: true,
              },
            })
          : [];

      return calculateProjectMetrics(projects, tasks);
    } catch (err: unknown) {
      logError("Erro ao calcular métricas globais de projetos da Integração", { err });
      if (err instanceof ServiceError) {
        throw err;
      }
      throw new ServiceError(500, "Erro ao calcular métricas globais de projetos.", err);
    }
  }
}

export function calculateProjectMetrics(
  projects: ProjectMetricsProject[],
  tasks: ProjectMetricsTask[],
): ProjectMetricsResult {
  const metrics: ProjectMetricsResult = {
    total: projects.length,
    completed: 0,
    inProgress: 0,
    paused: 0,
    toDo: 0,
    notContracted: 0,
    taskMetrics: {
      total: tasks.length,
      completed: 0,
      open: 0,
      paused: 0,
      emptyStatus: 0,
    },
  };

  for (const task of tasks) {
    const status = normalizeStatus(task.status);
    if (status === "") {
      metrics.taskMetrics.emptyStatus += 1;
    } else if (status === TASK_STATUS_COMPLETED) {
      metrics.taskMetrics.completed += 1;
    } else if (status === TASK_STATUS_PAUSED) {
      metrics.taskMetrics.paused += 1;
    } else {
      metrics.taskMetrics.open += 1;
    }
  }

  const tasksByProjectId = new Map<string, ProjectMetricsTask[]>();
  const tasksByClientId = new Map<string, ProjectMetricsTask[]>();

  for (const task of tasks) {
    const projectTasks = tasksByProjectId.get(task.project_id) ?? [];
    projectTasks.push(task);
    tasksByProjectId.set(task.project_id, projectTasks);

    const clientTasks = tasksByClientId.get(task.client_id) ?? [];
    clientTasks.push(task);
    tasksByClientId.set(task.client_id, clientTasks);
  }

  for (const project of projects) {
    const status = normalizeStatus(project.status);
    const projectTasks =
      tasksByProjectId.get(project.id) ?? tasksByClientId.get(project.client_id) ?? [];

    if (PROJECT_STATUS_TO_DO.has(status)) {
      metrics.toDo += 1;
      continue;
    }

    if (status === PROJECT_STATUS_PAUSED) {
      metrics.paused += 1;
      continue;
    }

    if (status === PROJECT_STATUS_NOT_CONTRACTED) {
      metrics.notContracted += 1;
      continue;
    }

    if (status === PROJECT_STATUS_COMPLETED) {
      metrics.completed += 1;
      continue;
    }

    if (status === PROJECT_STATUS_IN_PROGRESS) {
      metrics.inProgress += 1;
      continue;
    }

    if (status === PROJECT_STATUS_CLOSED) {
      if (hasOpenRelevantTask(projectTasks)) {
        metrics.inProgress += 1;
      } else if (projectTasks.length > 0 && hasCompletedTask(projectTasks)) {
        metrics.completed += 1;
      }
      continue;
    }

    if (status === PROJECT_STATUS_TERMINATED && hasNonCompletedTaskWithStatus(projectTasks)) {
      metrics.completed += 1;
    }
  }

  return metrics;
}
