import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, auditMock, workflowMock } = vi.hoisted(() => ({
  prismaMock: {
    task: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    permissionSpecific: {
      findFirst: vi.fn(),
    },
    permission: {
      findFirst: vi.fn(),
    },
  },
  auditMock: {
    logUpdateIfChanged: vi.fn(),
  },
  workflowMock: {
    afterTaskUpdated: vi.fn(),
  },
}));

vi.mock("../prisma/index.js", () => ({ default: prismaMock }));
vi.mock("../integrations/audit.js", () => auditMock);
vi.mock("../services/taskWorkflowService.js", () => ({
  TaskWorkflowService: vi.fn(function TaskWorkflowService() {
    return workflowMock;
  }),
}));

import { TaskLifecycleService } from "../services/taskLifecycleService.js";

describe("TaskLifecycleService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("concludeTask lança 404 quando tarefa não existe", async () => {
    prismaMock.task.findFirst.mockResolvedValue(null);
    const service = new TaskLifecycleService();

    await expect(
      service.concludeTask({
        user_id: "user-1",
        organization_id: "org-1",
        body: {
          task_id: "task-1",
          status: "Concluída",
          observations: "observacao",
          justification: "justificativa",
          responsible_id: "user-1",
        },
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("approveTaskCompletion lança 403 sem permissão de integração", async () => {
    prismaMock.task.findFirst.mockResolvedValue({
      id: "task-1",
      organization_id: "org-1",
      project_id: "project-1",
      status: "Em Andamento",
      billing: "Realizar",
    });
    prismaMock.permission.findFirst.mockResolvedValue({ integracao: 1 });
    const service = new TaskLifecycleService();

    await expect(
      service.approveTaskCompletion({
        user_id: "user-1",
        organization_id: "org-1",
        task_id: "task-1",
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});
