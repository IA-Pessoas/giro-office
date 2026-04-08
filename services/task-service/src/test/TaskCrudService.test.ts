import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, auditMock, workflowMock } = vi.hoisted(() => ({
  prismaMock: {
    task: {
      findFirst: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    taskModel: {
      findFirst: vi.fn(),
    },
    taskDependent: {
      findMany: vi.fn(),
    },
    user: {
      findFirst: vi.fn(),
    },
  },
  auditMock: {
    createLog: vi.fn(),
    logUpdateIfChanged: vi.fn(),
  },
  workflowMock: {
    afterTaskCreated: vi.fn(),
    afterTaskUpdated: vi.fn(),
  },
}));

vi.mock("../prisma/index.js", () => ({
  default: prismaMock,
}));

vi.mock("../integrations/audit.js", () => auditMock);

vi.mock("../services/TaskWorkflowService.js", () => ({
  TaskWorkflowService: vi.fn(function TaskWorkflowService() {
    return workflowMock;
  }),
}));

import { TaskCrudService } from "../services/TaskCrudService.js";

describe("TaskCrudService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("createTask lança 409 quando já existe tarefa em andamento", async () => {
    prismaMock.task.findFirst.mockResolvedValue({ id: "task-1" });
    const service = new TaskCrudService();

    await expect(
      service.createTask({
        user_id: "user-1",
        organization_id: "org-1",
        model_id: "model-1",
        project_id: "project-1",
        client_id: "client-1",
        prospecting_status: "Fechado",
        observations: "obs",
        urgency: "Alta",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("detailTask lança 404 quando tarefa não existe", async () => {
    prismaMock.task.findFirst.mockResolvedValue(null);
    const service = new TaskCrudService();

    await expect(service.detailTask("task-1", "org-1")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("deleteTask lança 403 quando usuário não tem permissão", async () => {
    prismaMock.task.findFirst.mockResolvedValue({ id: "task-1", organization_id: "org-1" });
    prismaMock.user.findFirst.mockResolvedValue({ id: "user-1", permission: 1 });
    const service = new TaskCrudService();

    await expect(
      service.deleteTask({
        task_id: "task-1",
        user_id: "user-1",
        organization_id: "org-1",
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});
