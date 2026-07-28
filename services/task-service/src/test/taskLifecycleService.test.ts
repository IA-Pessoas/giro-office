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
        integracaoLevel: 1,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("níveis 0 e 1 apenas solicitam conclusão mesmo com task_completion", async () => {
    prismaMock.task.findFirst.mockResolvedValue({
      id: "task-1",
      organization_id: "org-1",
      project_id: "project-1",
      status: "Em Andamento",
      pending_approval: false,
      responsible_id: "user-1",
      responsible2_id: null,
      responsible3_id: null,
      prevision_date: null,
      end_date: null,
      billing: "Realizar",
    });
    prismaMock.permissionSpecific.findFirst.mockResolvedValue({ task_completion: true });
    prismaMock.task.update.mockResolvedValue({
      id: "task-1",
      status: "Em Andamento",
      pending_approval: true,
      prevision_date: null,
      end_date: null,
      responsible_id: "user-1",
      responsible2_id: null,
      responsible3_id: null,
      observations: "observacao",
      justification: "justificativa",
    });
    const service = new TaskLifecycleService();

    await service.concludeTask({
      user_id: "user-1",
      organization_id: "org-1",
      integracaoLevel: 1,
      body: {
        task_id: "task-1",
        status: "Concluída",
        observations: "observacao",
        justification: "justificativa",
        responsible_id: "user-1",
      },
    });

    expect(prismaMock.task.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "Em Andamento", pending_approval: true }),
      }),
    );
  });
});
