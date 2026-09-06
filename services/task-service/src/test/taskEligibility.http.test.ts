import "express-async-errors";

import type { NextFunction, Request, Response } from "express";
import express from "express";
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

import { taskCrudRoutes } from "../routes/taskCrud.routes.js";

function createApp() {
  const app = express();
  app.use(express.json());
  app.use("/task", taskCrudRoutes);
  app.use(
    (
      err: { statusCode?: number; message?: string },
      _req: Request,
      res: Response,
      _next: NextFunction,
    ) => {
      res.status(err.statusCode ?? 500).json({ error: err.message ?? "Erro" });
    },
  );
  return app;
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
    },
    {
      name: "usuário inelegível",
      candidates: [{ id: "leader-1" }],
      body: taskBody("common-user"),
      status: 422,
    },
  ])("resolve $name", async ({ candidates, body, status, responsible }) => {
    prismaMock.user.findMany.mockResolvedValue(candidates);

    const response = await request(createApp()).post("/task").send(body);

    expect(response.status).toBe(status);
    if (status === 201) {
      expect(prismaMock.task.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            responsible_id: responsible,
            responsible2_id: null,
            responsible3_id: null,
          }),
        }),
      );
    } else {
      expect(prismaMock.task.create).not.toHaveBeenCalled();
    }
  });

  it("rejeita criação sem permissão de edição", async () => {
    authContext.level = 1;

    const response = await request(createApp()).post("/task").send(taskBody());

    expect(response.status).toBe(403);
    expect(prismaMock.project.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.task.create).not.toHaveBeenCalled();
  });
});
