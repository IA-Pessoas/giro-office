import "express-async-errors";

import { createLogger } from "@workspace/shared/logger";
import { MemoryLogStream } from "@workspace/shared/testUtils";
import type { NextFunction, Request, Response } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, authContext, auditMock, workflowMock } = vi.hoisted(() => ({
  prismaMock: {
    department: { findFirst: vi.fn() },
    project: { findFirst: vi.fn() },
    client: { findFirst: vi.fn() },
    task: {
      findFirst: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    taskModel: { findFirst: vi.fn() },
    taskDependent: { findMany: vi.fn() },
    user: { findFirst: vi.fn(), findMany: vi.fn() },
  },
  authContext: { level: 2 },
  auditMock: { createLog: vi.fn(), logUpdateIfChanged: vi.fn() },
  workflowMock: { afterTaskCreated: vi.fn(), afterTaskUpdated: vi.fn() },
}));

vi.mock("../prisma/index.js", () => ({ default: prismaMock }));
vi.mock("../integrations/audit.js", () => auditMock);
vi.mock("../services/taskWorkflowService.js", () => ({
  TaskWorkflowService: vi.fn(function TaskWorkflowService() {
    return workflowMock;
  }),
}));
vi.mock("../middlewares/isAuthenticated.js", () => ({
  isAuthenticated: (req: Request, _res: Response, next: NextFunction) => {
    req.user_id = "user-1";
    req.organization_id = "org-1";
    req.modules = { integracao: authContext.level };
    next();
  },
}));

import { createTaskApp } from "../app.js";
import type { TaskServiceEnv } from "../config/env.js";

function createApp() {
  const env = {
    port: 3032,
    databaseUrl: "postgresql://localhost/task_test",
    jwtSecret: "test-secret",
    nodeEnv: "test",
    logLevel: "silent",
    logPretty: false,
    auditEnabled: false,
    auditServiceUrl: "http://localhost:3020",
    auditServiceToken: "audit-service-token",
    projectServiceUrl: "http://localhost:3033",
    enableApiDocs: false,
  } satisfies TaskServiceEnv;
  const logger = createLogger({
    service: "task-service-test",
    env: "test",
    level: "silent",
    destination: new MemoryLogStream(),
  });

  return createTaskApp(env, logger);
}

function taskBody(responsible_id?: string | null) {
  return {
    model_id: "model-1",
    project_id: "project-1",
    client_id: "client-1",
    prospecting_status: "Fechado",
    department_id: "department-1",
    urgency: "Alta",
    ...(responsible_id !== undefined ? { responsible_id } : {}),
  };
}

const legacyTask = {
  id: "task-legacy",
  organization_id: "org-1",
  model_id: "model-legacy",
  project_id: "project-1",
  client_id: "11111111-1111-4111-8111-111111111111",
  name: "Tarefa legada",
  status: "Em Andamento",
  department_id: "department-1",
  observations: "",
  billing: "Não Realizar",
  urgency: "Alta",
  responsible_id: null,
  responsible2_id: "responsible-legacy-2",
  responsible3_id: null,
  prevision_date: null,
};

const assignedTask = {
  id: "task-assigned",
  name: "Tarefa atribuída",
  status: "Em Andamento",
  billing: "Não Realizar",
  charge_comercial: false,
  hiring_status: null,
  payment: null,
  billing_description: null,
  charge_financeiro: false,
  responsible_id: "user-1",
  responsible2_id: null,
  responsible3_id: null,
};

describe("elegibilidade manual de tarefas via rotas", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    authContext.level = 2;
    prismaMock.project.findFirst.mockResolvedValue({ client_id: "client-1" });
    prismaMock.task.findFirst.mockResolvedValue(null);
    prismaMock.taskModel.findFirst.mockResolvedValue({
      name: "Modelo",
      department_id: "department-1",
      billing: "Não Realizar",
      responsible_id: "model-default",
      responsible2_id: "legacy-2",
      responsible3_id: "legacy-3",
    });
    prismaMock.department.findFirst.mockResolvedValue({ id: "department-1" });
    prismaMock.task.create.mockImplementation(async ({ data }) => ({ id: "task-1", ...data }));
    prismaMock.taskDependent.findMany.mockResolvedValue([]);
  });

  it.each([
    {
      name: "padrão elegível",
      candidates: [{ id: "model-default" }, { id: "admin-2" }],
      body: taskBody(),
      status: 201,
      responsible: "model-default",
    },
    {
      name: "candidato único",
      candidates: [{ id: "leader-1" }],
      body: taskBody(),
      status: 201,
      responsible: "leader-1",
    },
    {
      name: "múltiplos sem escolha",
      candidates: [{ id: "leader-1" }, { id: "admin-2" }],
      body: taskBody(),
      status: 422,
      error: "Selecione um responsável elegível para a tarefa.",
    },
    { name: "nenhum candidato", candidates: [], body: taskBody(), status: 201, responsible: null },
    {
      name: "escolha explícita elegível",
      candidates: [{ id: "leader-1" }, { id: "admin-2" }],
      body: taskBody("admin-2"),
      status: 201,
      responsible: "admin-2",
    },
    {
      name: "desatribuição voluntária",
      candidates: [{ id: "leader-1" }],
      body: taskBody(null),
      status: 422,
      error: "Sem responsável só é permitido quando não há candidato elegível.",
    },
    {
      name: "usuário inelegível",
      candidates: [{ id: "leader-1" }],
      body: taskBody("common-user"),
      status: 422,
      error: "Responsável não é elegível para o departamento informado.",
    },
  ])("resolve $name", async ({ candidates, body, status, responsible, error }) => {
    prismaMock.user.findMany.mockResolvedValue(candidates);

    const response = await request(createApp()).post("/task").send(body);

    expect(response.status).toBe(status);
    if (status === 201) {
      expect(response.body).toEqual({
        success: true,
        data: {
          create: expect.objectContaining({
            id: "task-1",
            responsible_id: responsible,
            responsible2_id: null,
            responsible3_id: null,
          }),
        },
      });
    } else {
      expect(response.body).toEqual({
        success: false,
        error,
        code: "UNPROCESSABLE_ENTITY",
        requestId: expect.any(String),
      });
    }
  });

  it("rejeita criação sem permissão de edição", async () => {
    authContext.level = 1;

    const response = await request(createApp()).post("/task").send(taskBody());

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      success: false,
      error: "Acesso negado para esta operação.",
      code: "FORBIDDEN",
      requestId: expect.any(String),
    });
  });

  it("permite atribuição posterior sem migrar o modelo legado", async () => {
    prismaMock.task.findFirst.mockResolvedValue(legacyTask);
    prismaMock.user.findMany.mockResolvedValue([{ id: "responsible-later" }]);
    prismaMock.task.update.mockImplementation(async ({ data }) => ({
      id: legacyTask.id,
      ...data,
    }));

    const response = await request(createApp()).put("/task").send({
      task_id: legacyTask.id,
      responsible_id: "responsible-later",
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: expect.objectContaining({
        id: legacyTask.id,
        model_id: "model-legacy",
        department_id: "department-1",
        responsible_id: "responsible-later",
        responsible2_id: "responsible-legacy-2",
      }),
    });
  });

  it("preserva vínculos legados quando edita somente outro campo", async () => {
    prismaMock.task.findFirst.mockResolvedValue(legacyTask);
    prismaMock.task.update.mockImplementation(async ({ data }) => ({
      id: legacyTask.id,
      ...data,
    }));

    const response = await request(createApp()).put("/task").send({
      task_id: legacyTask.id,
      name: "Tarefa legada revisada",
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: expect.objectContaining({
        id: legacyTask.id,
        name: "Tarefa legada revisada",
        model_id: "model-legacy",
        responsible_id: null,
        responsible2_id: "responsible-legacy-2",
      }),
    });
  });

  it("troca departamento e modelo, resolve o responsável e preserva os demais campos", async () => {
    const taskBeforeSwap = {
      ...legacyTask,
      name: "Nome preservado",
      observations: "Observação preservada",
      billing: "Realizar",
      urgency: "Normal",
      prevision_date: new Date("2026-10-01T00:00:00.000Z"),
    };
    prismaMock.task.findFirst.mockResolvedValueOnce(taskBeforeSwap).mockResolvedValueOnce(null);
    prismaMock.department.findFirst.mockResolvedValue({ id: "department-2" });
    prismaMock.taskModel.findFirst.mockResolvedValue({
      id: "model-2",
      responsible_id: "responsible-default-2",
    });
    prismaMock.user.findMany.mockResolvedValue([{ id: "responsible-default-2" }]);
    prismaMock.task.update.mockImplementation(async ({ data }) => ({
      id: taskBeforeSwap.id,
      ...data,
    }));

    const response = await request(createApp()).put("/task").send({
      task_id: taskBeforeSwap.id,
      department_id: "department-2",
      model_id: "model-2",
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: expect.objectContaining({
        id: taskBeforeSwap.id,
        department_id: "department-2",
        model_id: "model-2",
        responsible_id: "responsible-default-2",
        responsible2_id: null,
        responsible3_id: null,
        name: "Nome preservado",
        observations: "Observação preservada",
        billing: "Realizar",
        urgency: "Normal",
        prevision_date: "2026-10-01T00:00:00.000Z",
      }),
    });
  });

  it("rejeita troca para modelo incompatível com o departamento", async () => {
    prismaMock.task.findFirst.mockResolvedValueOnce(legacyTask).mockResolvedValueOnce(null);
    prismaMock.department.findFirst.mockResolvedValue({ id: "department-2" });
    prismaMock.taskModel.findFirst.mockResolvedValue(null);

    const response = await request(createApp()).put("/task").send({
      task_id: legacyTask.id,
      department_id: "department-2",
      model_id: "model-incompatible",
    });

    expect(response.status).toBe(422);
    expect(response.body).toEqual({
      success: false,
      error: "Modelo de tarefa não é elegível para o departamento informado.",
      code: "UNPROCESSABLE_ENTITY",
      requestId: expect.any(String),
    });
    expect(prismaMock.task.update).not.toHaveBeenCalled();
  });

  it("nega atribuição posterior sem permissão de edição", async () => {
    authContext.level = 1;
    prismaMock.task.findFirst.mockResolvedValue(legacyTask);

    const response = await request(createApp()).put("/task").send({
      task_id: legacyTask.id,
      responsible_id: "responsible-later",
    });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      success: false,
      error: "Recurso não encontrado.",
      code: "NOT_FOUND",
      requestId: expect.any(String),
    });
  });

  it("filtra tarefas atribuídas pela rota real", async () => {
    prismaMock.task.findMany.mockImplementation(async ({ where }) =>
      where.responsible_id?.not === null ? [assignedTask] : [],
    );
    prismaMock.task.count.mockResolvedValue(1);

    const response = await request(createApp()).get("/task/list").query({ assignment: "assigned" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: {
        data: [
          {
            id: "task-assigned",
            name: "Tarefa atribuída",
            status: "Em Andamento",
            billing: "Não Realizar",
            charge_comercial: false,
            hiring_status: null,
            payment: null,
            billing_description: null,
            charge_financeiro: false,
            isOwn: true,
            isUnassigned: false,
          },
        ],
        total: 1,
        hasMore: false,
        summary: { inProgress: 1, billable: 1 },
      },
    });
  });

  it.each([
    ["inexistente", "11111111-1111-4111-8111-111111111111"],
    ["de outra organização", "22222222-2222-4222-8222-222222222222"],
  ])("rejeita cliente %s pela rota real", async (_label, clientId) => {
    prismaMock.client.findFirst.mockResolvedValue(null);

    const response = await request(createApp()).get("/task/list").query({ client_id: clientId });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      success: false,
      error: "Cliente não encontrado.",
      code: "NOT_FOUND",
      requestId: expect.any(String),
    });
  });

  it("combina cliente e atribuição com a visibilidade restrita", async () => {
    authContext.level = 0;
    prismaMock.client.findFirst.mockResolvedValue({ id: legacyTask.client_id });
    prismaMock.task.findMany.mockImplementation(async ({ where }) => {
      const serializedWhere = JSON.stringify(where);
      const hasClient = where.client_id === legacyTask.client_id;
      const hasAssignedFilter = where.responsible_id?.not === null;
      const hasOwnVisibility = serializedWhere.includes('"responsible_id":"user-1"');
      const hasActiveVisibility = serializedWhere.includes('"Em Andamento"');
      return hasClient && hasAssignedFilter && hasOwnVisibility && hasActiveVisibility
        ? [assignedTask]
        : [];
    });
    prismaMock.task.count.mockResolvedValue(1);

    const response = await request(createApp()).get("/task/list").query({
      client_id: legacyTask.client_id,
      assignment: "assigned",
    });

    expect(response.status).toBe(200);
    expect(response.body.data.data).toEqual([
      expect.objectContaining({ id: "task-assigned", isOwn: true, isUnassigned: false }),
    ]);
  });
});
