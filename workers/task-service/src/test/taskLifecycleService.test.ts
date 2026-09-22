import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, auditMock, workflowMock, operationalNotificationMock } = vi.hoisted(() => ({
  prismaMock: {
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(prismaMock)),
    task: {
      findFirst: vi.fn(),
      findFirstOrThrow: vi.fn(),
      update: vi.fn(),
    },
    taskCompletionRequest: {
      findFirst: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      findMany: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
    },
    permissionSpecific: {
      findFirst: vi.fn(),
    },
    permission: {
      findFirst: vi.fn(),
    },
  },
  auditMock: {
    createLog: vi.fn(),
    logUpdateIfChanged: vi.fn(),
  },
  workflowMock: {
    afterTaskUpdated: vi.fn(),
  },
  operationalNotificationMock: vi.fn(),
}));

vi.mock("../prisma/index.js", () => ({ default: prismaMock }));
vi.mock("../integrations/audit.js", () => auditMock);
vi.mock("../services/taskWorkflowService.js", () => ({
  TaskWorkflowService: vi.fn(function TaskWorkflowService() {
    return workflowMock;
  }),
}));
vi.mock("../services/taskOperationalNotificationService.js", () => ({
  publishTaskOperationalNotifications: operationalNotificationMock,
  TASK_OPERATIONAL_NOTIFICATION_TYPE: {
    COMPLETION_REQUEST: "completion_request",
    COMPLETION_DECISION: "completion_decision",
    TASK_CHANGED: "task_changed",
  },
}));

import { TaskLifecycleService } from "../services/taskLifecycleService.js";

describe("TaskLifecycleService", () => {
  it("cria uma única solicitação pendente e marca a tarefa na mesma transação", async () => {
    prismaMock.task.findFirst.mockResolvedValue({
      id: "task-1",
      organization_id: "org-1",
      responsible_id: "user-1",
      responsible2_id: null,
      responsible3_id: null,
    });
    prismaMock.taskCompletionRequest.findFirst.mockResolvedValue(null);
    prismaMock.taskCompletionRequest.create.mockResolvedValue({
      id: "request-1",
      status: "pending",
    });
    prismaMock.task.update.mockResolvedValue({ id: "task-1", pending_approval: true });

    await expect(
      new TaskLifecycleService().requestTaskCompletion({
        user_id: "user-1",
        organization_id: "org-1",
        task_id: "task-1",
        reason: "Pronta para validação.",
        integracaoLevel: 0,
      }),
    ).resolves.toMatchObject({ id: "request-1", status: "pending" });

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.task.update).toHaveBeenCalledWith({
      where: { id: "task-1" },
      data: { pending_approval: true },
    });
    expect(auditMock.createLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "Solicitação de Conclusão", required: true }),
    );
  });

  it("notifica os responsáveis atuais sem avisar quem solicitou a conclusão", async () => {
    prismaMock.task.findFirst.mockResolvedValue({
      id: "task-1",
      organization_id: "org-1",
      status: "Em Andamento",
      responsible_id: "user-1",
      responsible2_id: "user-2",
      responsible3_id: null,
    });
    prismaMock.taskCompletionRequest.findFirst.mockResolvedValue(null);
    prismaMock.taskCompletionRequest.create.mockResolvedValue({
      id: "request-1",
      status: "pending",
    });
    prismaMock.task.update.mockResolvedValue({ id: "task-1", pending_approval: true });

    await new TaskLifecycleService().requestTaskCompletion({
      user_id: "user-1",
      organization_id: "org-1",
      task_id: "task-1",
      reason: "Pronta para validação.",
      integracaoLevel: 0,
    });

    expect(operationalNotificationMock).toHaveBeenCalledWith(
      prismaMock,
      expect.objectContaining({
        organization_id: "org-1",
        task_id: "task-1",
        event_key: "completion-request:request-1",
        responsible_ids: ["user-1", "user-2", null],
        exclude_user_id: "user-1",
      }),
    );
  });

  it("converte a colisão da solicitação concorrente em conflito", async () => {
    prismaMock.task.findFirst.mockResolvedValue({
      id: "task-1",
      organization_id: "org-1",
      status: "Em Andamento",
      responsible_id: "user-1",
      responsible2_id: null,
      responsible3_id: null,
    });
    prismaMock.taskCompletionRequest.findFirst.mockResolvedValue(null);
    prismaMock.taskCompletionRequest.create.mockRejectedValue({ code: "P2002" });

    await expect(
      new TaskLifecycleService().requestTaskCompletion({
        user_id: "user-1",
        organization_id: "org-1",
        task_id: "task-1",
        reason: "Pronta.",
        integracaoLevel: 0,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(prismaMock.task.update).not.toHaveBeenCalled();
  });

  it("revalida a tarefa dentro da transação antes de criar a solicitação", async () => {
    prismaMock.task.findFirst
      .mockResolvedValueOnce({
        id: "task-1",
        organization_id: "org-1",
        status: "Em Andamento",
        responsible_id: "user-1",
        responsible2_id: null,
        responsible3_id: null,
      })
      .mockResolvedValueOnce({
        id: "task-1",
        organization_id: "org-1",
        status: "Concluída",
        responsible_id: "user-1",
        responsible2_id: null,
        responsible3_id: null,
      });

    await expect(
      new TaskLifecycleService().requestTaskCompletion({
        user_id: "user-1",
        organization_id: "org-1",
        task_id: "task-1",
        reason: "Pronta.",
        integracaoLevel: 0,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(prismaMock.taskCompletionRequest.create).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
    });
  });

  it("lista o histórico apenas da tarefa e organização solicitadas", async () => {
    prismaMock.task.findFirst.mockResolvedValue({
      id: "task-1",
      organization_id: "org-1",
      responsible_id: "user-1",
      responsible2_id: null,
      responsible3_id: null,
    });
    prismaMock.taskCompletionRequest.findMany.mockResolvedValue([]);

    await expect(
      new TaskLifecycleService().listTaskCompletionRequests({
        user_id: "user-1",
        organization_id: "org-1",
        task_id: "task-1",
        integracaoLevel: 0,
      }),
    ).resolves.toEqual([]);

    expect(prismaMock.taskCompletionRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { task_id: "task-1", organization_id: "org-1" },
        orderBy: { created_at: "desc" },
      }),
    );
  });

  it("conclusão preserva responsável nulo e vínculos secundários legados", async () => {
    prismaMock.task.findFirst.mockResolvedValue({
      id: "task-1",
      organization_id: "org-1",
      department_id: "dep-1",
      responsible_id: null,
      responsible2_id: "legacy-user",
      responsible3_id: null,
      status: "Em Andamento",
    });
    prismaMock.task.update.mockImplementation(async ({ data }) => ({ id: "task-1", ...data }));
    prismaMock.permissionSpecific.findFirst.mockResolvedValue({ task_completion: true });
    await expect(
      new TaskLifecycleService().concludeTask({
        user_id: "user-1",
        organization_id: "org-1",
        integracaoLevel: 1,
        isOwner: true,
        body: {
          task_id: "task-1",
          status: "Concluída",
          responsible_id: null,
          observations: "",
          justification: "",
        },
      }),
    ).resolves.toMatchObject({
      responsible_id: null,
      responsible2_id: "legacy-user",
      status: "Concluída",
    });
    expect(prismaMock.user.findMany).not.toHaveBeenCalled();
    expect(auditMock.logUpdateIfChanged).toHaveBeenCalledWith(
      expect.objectContaining({ action: "Conclusão", required: true }),
    );
  });
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

  it("aprova uma solicitação pendente sem criar novo histórico", async () => {
    prismaMock.task.findFirst.mockResolvedValue({
      id: "task-1",
      organization_id: "org-1",
      project_id: "project-1",
      status: "Em Andamento",
      pending_approval: true,
      billing: "Realizar",
    });
    prismaMock.permissionSpecific.findFirst.mockResolvedValue({ task_completion: true });
    prismaMock.taskCompletionRequest.findFirst.mockResolvedValue({
      id: "request-1",
      task_id: "task-1",
      organization_id: "org-1",
      requester_id: "user-2",
      status: "pending",
    });
    prismaMock.taskCompletionRequest.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.task.update.mockResolvedValue({
      id: "task-1",
      status: "Concluída",
      pending_approval: false,
    });

    await expect(
      new TaskLifecycleService().approveTaskCompletion({
        user_id: "user-1",
        organization_id: "org-1",
        task_id: "task-1",
        request_id: "request-1",
        integracaoLevel: 2,
      }),
    ).resolves.toMatchObject({ status: "Concluída", pending_approval: false });

    expect(prismaMock.taskCompletionRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "request-1", status: "pending" },
        data: expect.objectContaining({ status: "approved", decided_by: "user-1" }),
      }),
    );
    expect(prismaMock.task.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: "Concluída", pending_approval: false, end_date: expect.any(Date) },
      }),
    );
    expect(auditMock.createLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "Aprovação de Conclusão", required: true }),
    );
  });

  it("recusa uma solicitação com motivo e mantém a tarefa em andamento", async () => {
    prismaMock.task.findFirst.mockResolvedValue({
      id: "task-1",
      organization_id: "org-1",
      project_id: "project-1",
      status: "Em Andamento",
      pending_approval: true,
      billing: "Realizar",
    });
    prismaMock.permissionSpecific.findFirst.mockResolvedValue({ task_completion: true });
    prismaMock.taskCompletionRequest.findFirst.mockResolvedValue({
      id: "request-1",
      task_id: "task-1",
      organization_id: "org-1",
      requester_id: "user-2",
      status: "pending",
    });
    prismaMock.taskCompletionRequest.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.task.update.mockResolvedValue({
      id: "task-1",
      status: "Em Andamento",
      pending_approval: false,
    });

    await expect(
      new TaskLifecycleService().approveTaskCompletion({
        user_id: "user-1",
        organization_id: "org-1",
        task_id: "task-1",
        request_id: "request-1",
        decision: "refused",
        reason: "Falta documento obrigatório.",
        integracaoLevel: 2,
      }),
    ).resolves.toMatchObject({ status: "Em Andamento", pending_approval: false });

    expect(prismaMock.taskCompletionRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "refused",
          decision_reason: "Falta documento obrigatório.",
        }),
      }),
    );
  });

  it("trata a repetição da mesma decisão como idempotente", async () => {
    prismaMock.task.findFirst.mockResolvedValue({
      id: "task-1",
      organization_id: "org-1",
      project_id: "project-1",
      status: "Concluída",
      pending_approval: false,
      billing: "Realizar",
    });
    prismaMock.permissionSpecific.findFirst.mockResolvedValue({ task_completion: true });
    prismaMock.taskCompletionRequest.findFirst.mockResolvedValue({
      id: "request-1",
      task_id: "task-1",
      organization_id: "org-1",
      requester_id: "user-2",
      status: "approved",
    });
    prismaMock.task.findFirstOrThrow.mockResolvedValue({
      id: "task-1",
      status: "Concluída",
      pending_approval: false,
    });

    await expect(
      new TaskLifecycleService().approveTaskCompletion({
        user_id: "user-1",
        organization_id: "org-1",
        task_id: "task-1",
        request_id: "request-1",
        integracaoLevel: 2,
      }),
    ).resolves.toMatchObject({ status: "Concluída", pending_approval: false });

    expect(prismaMock.taskCompletionRequest.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.task.update).not.toHaveBeenCalled();
    expect(auditMock.createLog).not.toHaveBeenCalled();
  });

  it("não duplica decisão quando outra transação já a confirmou", async () => {
    prismaMock.task.findFirst.mockResolvedValue({
      id: "task-1",
      organization_id: "org-1",
      project_id: "project-1",
      status: "Concluída",
      pending_approval: false,
      billing: "Realizar",
    });
    prismaMock.permissionSpecific.findFirst.mockResolvedValue({ task_completion: true });
    prismaMock.taskCompletionRequest.findFirst
      .mockResolvedValueOnce({
        id: "request-1",
        task_id: "task-1",
        organization_id: "org-1",
        requester_id: "user-2",
        status: "pending",
      })
      .mockResolvedValueOnce({ id: "request-1", organization_id: "org-1", status: "approved" });
    prismaMock.taskCompletionRequest.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.task.findFirstOrThrow.mockResolvedValue({
      id: "task-1",
      status: "Concluída",
      pending_approval: false,
    });

    await expect(
      new TaskLifecycleService().approveTaskCompletion({
        user_id: "user-1",
        organization_id: "org-1",
        task_id: "task-1",
        request_id: "request-1",
        integracaoLevel: 2,
      }),
    ).resolves.toMatchObject({ status: "Concluída", pending_approval: false });

    expect(prismaMock.task.update).not.toHaveBeenCalled();
    expect(auditMock.createLog).not.toHaveBeenCalled();
  });

  it("permite ao solicitante cancelar uma pendência e reenviar depois", async () => {
    prismaMock.task.findFirst.mockResolvedValue({
      id: "task-1",
      organization_id: "org-1",
      responsible_id: "user-1",
      responsible2_id: null,
      responsible3_id: null,
    });
    prismaMock.taskCompletionRequest.findFirst.mockResolvedValue({
      id: "request-1",
      task_id: "task-1",
      organization_id: "org-1",
      requester_id: "user-1",
      status: "pending",
    });
    prismaMock.taskCompletionRequest.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.task.update.mockResolvedValue({ id: "task-1", pending_approval: false });

    await expect(
      new TaskLifecycleService().cancelTaskCompletion({
        user_id: "user-1",
        organization_id: "org-1",
        task_id: "task-1",
        request_id: "request-1",
        integracaoLevel: 0,
      }),
    ).resolves.toMatchObject({ id: "request-1", status: "canceled" });

    expect(prismaMock.taskCompletionRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "request-1", status: "pending" },
        data: expect.objectContaining({ status: "canceled", decided_by: "user-1" }),
      }),
    );
    expect(prismaMock.task.update).toHaveBeenCalledWith({
      where: { id: "task-1" },
      data: { pending_approval: false },
    });
  });

  it("reabre tarefa concluída somente pelo fluxo administrativo e audita a ação", async () => {
    prismaMock.task.findFirst.mockResolvedValue({
      id: "task-1",
      organization_id: "org-1",
      project_id: "project-1",
      status: "Concluída",
      pending_approval: false,
      billing: "Realizar",
      responsible_id: "user-2",
      responsible2_id: null,
      responsible3_id: null,
    });
    prismaMock.task.update.mockResolvedValue({
      id: "task-1",
      status: "Em Andamento",
      pending_approval: false,
    });

    await expect(
      new TaskLifecycleService().reopenTask({
        user_id: "admin-1",
        organization_id: "org-1",
        task_id: "task-1",
        reason: "Documentos complementares pendentes.",
        integracaoLevel: 3,
      }),
    ).resolves.toMatchObject({ status: "Em Andamento", pending_approval: false });

    expect(prismaMock.task.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: "Em Andamento", pending_approval: false, end_date: null },
      }),
    );
    expect(auditMock.createLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "Reabertura de Tarefa", required: true }),
    );
    expect(operationalNotificationMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        title: "Tarefa reaberta",
        include_administrators: true,
        exclude_user_id: "admin-1",
        responsible_ids: ["user-2", null, null],
      }),
    );
  });

  it("níveis 0 e 1 registram uma solicitação ao pedir conclusão", async () => {
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
    prismaMock.taskCompletionRequest.findFirst.mockResolvedValue(null);
    prismaMock.taskCompletionRequest.create.mockResolvedValue({
      id: "request-1",
      status: "pending",
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
    expect(prismaMock.taskCompletionRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          task_id: "task-1",
          organization_id: "org-1",
          requester_id: "user-1",
        }),
      }),
    );
  });

  it("não cria solicitação legada quando a tarefa foi concluída simultaneamente", async () => {
    const activeTask = {
      id: "task-1",
      organization_id: "org-1",
      department_id: "dep-1",
      project_id: "project-1",
      status: "Em Andamento",
      pending_approval: false,
      responsible_id: "user-1",
      responsible2_id: null,
      responsible3_id: null,
      prevision_date: null,
      end_date: null,
      billing: "Realizar",
    };
    prismaMock.task.findFirst
      .mockResolvedValueOnce(activeTask)
      .mockResolvedValueOnce({ ...activeTask, status: "Concluída" });
    prismaMock.permissionSpecific.findFirst.mockResolvedValue({ task_completion: false });

    await expect(
      new TaskLifecycleService().concludeTask({
        user_id: "user-1",
        organization_id: "org-1",
        integracaoLevel: 1,
        body: {
          task_id: "task-1",
          status: "Concluída",
          observations: "Pronta.",
          justification: "Pronta.",
          responsible_id: "user-1",
        },
      }),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(prismaMock.task.update).not.toHaveBeenCalled();
    expect(prismaMock.taskCompletionRequest.create).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
    });
  });

  it("reautoriza a conclusão legada com o responsável atual da transação", async () => {
    const activeTask = {
      id: "task-1",
      organization_id: "org-1",
      department_id: "dep-1",
      project_id: "project-1",
      status: "Em Andamento",
      pending_approval: false,
      responsible_id: "user-1",
      responsible2_id: null,
      responsible3_id: null,
      prevision_date: null,
      end_date: null,
      billing: "Realizar",
    };
    prismaMock.task.findFirst
      .mockResolvedValueOnce(activeTask)
      .mockResolvedValueOnce({ ...activeTask, responsible_id: "user-2" });
    prismaMock.permissionSpecific.findFirst.mockResolvedValue({ task_completion: false });

    await expect(
      new TaskLifecycleService().concludeTask({
        user_id: "user-1",
        organization_id: "org-1",
        integracaoLevel: 0,
        body: {
          task_id: "task-1",
          status: "Concluída",
          observations: "Pronta.",
          justification: "Pronta.",
          responsible_id: "user-1",
        },
      }),
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(prismaMock.task.update).not.toHaveBeenCalled();
    expect(prismaMock.taskCompletionRequest.create).not.toHaveBeenCalled();
  });
  it("rejeita novo responsavel fora do departamento da tarefa", async () => {
    prismaMock.task.findFirst.mockResolvedValue({
      id: "task-1",
      organization_id: "org-1",
      department_id: "department-1",
      project_id: "project-1",
      status: "Em Andamento",
      pending_approval: false,
      responsible_id: "legacy-user",
      responsible2_id: null,
      responsible3_id: null,
      prevision_date: null,
      end_date: null,
      billing: "Realizar",
    });
    prismaMock.user.findMany.mockResolvedValue([]);
    const service = new TaskLifecycleService();

    await expect(
      service.concludeTask({
        user_id: "user-1",
        organization_id: "org-1",
        integracaoLevel: 2,
        isOwner: true,
        body: {
          task_id: "task-1",
          status: "Em Andamento",
          observations: "observacao",
          justification: "justificativa",
          responsible_id: "outside-department-user",
        },
      }),
    ).rejects.toMatchObject({ statusCode: 422 });

    expect(prismaMock.task.update).not.toHaveBeenCalled();
    expect(prismaMock.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ["outside-department-user"] },
          department: { id: "department-1", organization_id: "org-1" },
        }),
      }),
    );
  });
});
