import "./envBootstrap.js";

import { describe, expect, it, vi } from "vitest";

import type { ProjectMetricsPrisma } from "../services/projectMetricsService.js";
import {
  calculateProjectMetrics,
  ProjectMetricsService,
} from "../services/projectMetricsService.js";

const ORG_ID = "a0000000-0000-4000-8000-000000000001";
const CLIENT_ID = "b0000000-0000-4000-8000-000000000001";

function createMockPrisma(): ProjectMetricsPrisma {
  return {
    project: {
      findMany: vi.fn(async () => []),
    },
    task: {
      findMany: vi.fn(async () => []),
    },
  } as unknown as ProjectMetricsPrisma;
}

describe("ProjectMetricsService", () => {
  it("getGlobalMetrics consulta projetos e tarefas escopados por organização", async () => {
    const prisma = createMockPrisma();
    prisma.project.findMany = vi.fn(async () => [
      { id: "project-1", client_id: CLIENT_ID, status: "Fechado" },
    ]);
    prisma.task.findMany = vi.fn(async () => [
      { project_id: "project-1", client_id: CLIENT_ID, status: "Concluída" },
    ]);
    const service = new ProjectMetricsService(prisma);

    const result = await service.getGlobalMetrics(ORG_ID);

    expect(result.completed).toBe(1);
    expect(prisma.project.findMany).toHaveBeenCalledWith({
      where: { organization_id: ORG_ID },
      select: { id: true, client_id: true, status: true },
    });
    expect(prisma.task.findMany).toHaveBeenCalledWith({
      where: {
        organization_id: ORG_ID,
        OR: [{ project_id: { in: ["project-1"] } }, { client_id: { in: [CLIENT_ID] } }],
      },
      select: { project_id: true, client_id: true, status: true },
    });
  });

  it("calculateProjectMetrics reproduz os cards globais e aceita Em andamento/Em Andamento", () => {
    const projects = [
      { id: "todo", client_id: "client-todo", status: "Envio de Proposta" },
      { id: "paused", client_id: "client-paused", status: "Paralisado" },
      { id: "not-contracted", client_id: "client-not", status: "Recusado pelo Cliente" },
      { id: "closed-completed", client_id: "client-completed", status: "Fechado" },
      { id: "closed-open-lower", client_id: "client-open-lower", status: "Fechado" },
      { id: "closed-open-upper", client_id: "client-open-upper", status: "Fechado" },
      { id: "terminated", client_id: "client-terminated", status: "Distrato" },
      { id: "current-completed", client_id: "client-current-completed", status: "Concluído" },
      { id: "current-progress", client_id: "client-current-progress", status: "Em andamento" },
    ];
    const tasks = [
      { project_id: "closed-completed", client_id: "client-completed", status: "Concluída" },
      { project_id: "closed-open-lower", client_id: "client-open-lower", status: "Em andamento" },
      { project_id: "closed-open-upper", client_id: "client-open-upper", status: "Em Andamento" },
      { project_id: "terminated", client_id: "client-terminated", status: "Não Contratado" },
      { project_id: "paused", client_id: "client-paused", status: "Paralisado" },
      { project_id: "todo", client_id: "client-todo", status: "" },
    ];

    const result = calculateProjectMetrics(projects, tasks);

    expect(result).toEqual({
      total: 9,
      completed: 3,
      inProgress: 3,
      paused: 1,
      toDo: 1,
      notContracted: 1,
      taskMetrics: {
        total: 6,
        completed: 1,
        open: 3,
        paused: 1,
        emptyStatus: 1,
      },
    });
  });

  it("calculateProjectMetrics usa tarefas por client_id quando não há tarefa por project_id", () => {
    const result = calculateProjectMetrics(
      [{ id: "project-1", client_id: CLIENT_ID, status: "Fechado" }],
      [{ project_id: "other-project", client_id: CLIENT_ID, status: "Concluída" }],
    );

    expect(result.completed).toBe(1);
    expect(result.inProgress).toBe(0);
  });

  it("getGlobalMetrics envolve erro inesperado em ServiceError 500", async () => {
    const prisma = createMockPrisma();
    prisma.project.findMany = vi.fn(async () => {
      throw new Error("db down");
    });
    const service = new ProjectMetricsService(prisma);

    await expect(service.getGlobalMetrics(ORG_ID)).rejects.toMatchObject({ statusCode: 500 });
  });
});
