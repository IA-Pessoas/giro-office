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

describe("elegibilidade manual de tarefas via HTTP", () => {
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
});
