import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, auditMock, workflowMock, operationalNotificationMock } = vi.hoisted(() => ({
  prismaMock: {
    $transaction: vi.fn(),
    department: {
      findFirst: vi.fn(),
    },
    project: {
      findFirst: vi.fn(),
    },
    client: {
      findFirst: vi.fn(),
    },
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
      findMany: vi.fn(),
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
  operationalNotificationMock: vi.fn(),
}));

vi.mock("../prisma/index.js", () => ({
  default: prismaMock,
}));

vi.mock("../integrations/audit.js", () => auditMock);

vi.mock("../services/taskWorkflowService.js", () => ({
  TaskWorkflowService: vi.fn(function TaskWorkflowService() {
    return workflowMock;
  }),
}));
vi.mock("../services/taskOperationalNotificationService.js", () => ({
  publishTaskOperationalNotifications: operationalNotificationMock,
  TASK_OPERATIONAL_NOTIFICATION_TYPE: { TASK_CHANGED: "task_changed" },
}));

import type { Prisma } from "../generated/prisma/client.js";
import { TaskCrudService } from "../services/taskCrudService.js";

describe("TaskCrudService", () => {
  it("createTaskInTransaction persiste tarefa e dependentes somente no tx sem efeitos pós-commit", async () => {
    const tx = {
      $transaction: vi.fn(),
      project: { findFirst: vi.fn().mockResolvedValue({ client_id: "client-1" }) },
      department: { findFirst: vi.fn().mockResolvedValue({ id: "dep-1" }) },
      task: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn(async ({ data }) => ({ id: `task-${data.model_id}`, ...data })),
      },
      taskModel: {
        findFirst: vi.fn().mockResolvedValue({
          name: "Modelo",
          department_id: "dep-1",
          billing: "Não Realizar",
          responsible_id: "user-1",
          responsible2_id: null,
          responsible3_id: null,
        }),
      },
      user: { findMany: vi.fn().mockResolvedValue([{ id: "user-1" }]) },
      taskDependent: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ dependent_id: "model-2", wait: true, observation: "Dependente" }]),
      },
    };

    const result = await new TaskCrudService().createTaskInTransaction(
      {
        user_id: "user-1",
        organization_id: "org-1",
        model_id: "model-1",
        project_id: "project-1",
        client_id: "client-1",
        prospecting_status: "Fechado",
        observations: "Principal",
        urgency: "Alta",
        integracaoLevel: 2,
      },
      tx as unknown as Prisma.TransactionClient,
    );

    expect(result).toMatchObject({
      create: { id: "task-model-1", status: "Em Andamento", observations: "Principal" },
      dependentCreates: [
        { create: { id: "task-model-2", status: "Em Espera", observations: "Dependente" } },
      ],
    });
    expect(tx.project.findFirst).toHaveBeenCalledWith({
      where: { id: "project-1", organization_id: "org-1" },
      select: { client_id: true },
    });
    expect(tx.task.findFirst).toHaveBeenCalledTimes(2);
    expect(tx.taskModel.findFirst).toHaveBeenCalledTimes(2);
    expect(tx.user.findMany).toHaveBeenCalledTimes(2);
    expect(tx.department.findFirst).toHaveBeenCalledOnce();
    expect(tx.taskDependent.findMany).toHaveBeenCalledOnce();
    expect(tx.$transaction).not.toHaveBeenCalled();
    for (const delegate of Object.values(prismaMock)) {
      if (typeof delegate === "function") {
        expect(delegate).not.toHaveBeenCalled();
        continue;
      }
      for (const operation of Object.values(delegate)) {
        expect(operation).not.toHaveBeenCalled();
      }
    }
    expect(auditMock.createLog).not.toHaveBeenCalled();
    expect(workflowMock.afterTaskCreated).not.toHaveBeenCalled();
  });

  it.each([
    false,
    true,
  ])("createTask aguarda commit e preserva efeitos pós-commit (falha: %s)", async (failCommit) => {
    const tx = {
      ...prismaMock,
      project: { findFirst: vi.fn().mockResolvedValue({ client_id: "client-1" }) },
    };
    prismaMock.task.findFirst.mockResolvedValue(null);
    prismaMock.taskModel.findFirst.mockResolvedValue({
      name: "Modelo",
      department_id: "dep-1",
      billing: "Não Realizar",
      responsible_id: "user-1",
      responsible2_id: null,
      responsible3_id: null,
    });
    prismaMock.task.create.mockImplementation(async ({ data }) => ({ id: data.model_id, ...data }));
    prismaMock.taskDependent.findMany.mockResolvedValue([
      { dependent_id: "dependent-1", wait: true, observation: "Dependente" },
    ]);
    prismaMock.$transaction.mockImplementation(async (callback) => {
      const result = await callback(tx);
      expect(auditMock.createLog).not.toHaveBeenCalled();
      expect(workflowMock.afterTaskCreated).not.toHaveBeenCalled();
      if (failCommit) throw new Error("commit failed");
      return result;
    });

    const result = new TaskCrudService().createTask({
      user_id: "user-1",
      organization_id: "org-1",
      model_id: "model-1",
      project_id: "project-1",
      client_id: "client-1",
      prospecting_status: "Fechado",
      observations: "",
      urgency: "Alta",
      integracaoLevel: 2,
    });

    if (failCommit) {
      await expect(result).rejects.toMatchObject({ statusCode: 500 });
      expect(auditMock.createLog).not.toHaveBeenCalled();
      expect(workflowMock.afterTaskCreated).not.toHaveBeenCalled();
    } else {
      await expect(result).resolves.toEqual({ create: expect.objectContaining({ id: "model-1" }) });
      expect(auditMock.createLog.mock.calls.map(([event]) => event.referringId)).toEqual([
        "model-1",
        "dependent-1",
      ]);
      expect(workflowMock.afterTaskCreated).toHaveBeenCalledWith({
        projectId: "project-1",
        userId: "user-1",
        organizationId: "org-1",
      });
    }
    expect(prismaMock.$transaction).toHaveBeenCalledOnce();
    expect(prismaMock.project.findFirst).not.toHaveBeenCalled();
  });

  it.each([
    { integracaoLevel: 1 as const },
    { integracaoLevel: 2 as const },
    { integracaoLevel: 3 as const },
    { integracaoLevel: 0 as const, isOwner: true },
  ])("leitura de tarefa não atribuída respeita escopo: %j", async (authorization) => {
    const task = {
      id: "unassigned",
      organization_id: "org-1",
      client: { name: "Empresa", company_name: null },
      project: { name: "Projeto" },
      responsible_id: null,
      responsible2_id: null,
      responsible3_id: null,
    };
    prismaMock.task.findFirst.mockImplementation(async ({ where }) =>
      where.organization_id === task.organization_id ? task : null,
    );
    prismaMock.task.findMany.mockResolvedValue([task]);
    prismaMock.task.count.mockResolvedValue(1);
    const service = new TaskCrudService();
    await expect(
      service.detailTask("unassigned", "org-1", { user_id: "user-1", ...authorization }),
    ).resolves.toMatchObject({ detail: { responsible_id: null } });
    const result = await service.listTasks({
      user_id: "user-1",
      organization_id: "org-1",
      status: "Todos",
      ref: "",
      ref_id: "",
      search: "",
      page: 1,
      limit: 20,
      ...authorization,
    });
    expect(result.data[0]).toMatchObject({ id: "unassigned", isOwn: false });
    expect(prismaMock.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organization_id: "org-1" } }),
    );
    await expect(
      service.detailTask("unassigned", "org-other", { user_id: "user-1", ...authorization }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("nível 0 não lê nem edita tarefa não atribuída; secundário continua próprio", async () => {
    const task = {
      id: "unassigned",
      organization_id: "org-1",
      responsible_id: null,
      responsible2_id: null,
      responsible3_id: null,
    };
    prismaMock.task.findFirst.mockResolvedValue(task);
    const service = new TaskCrudService();
    await expect(
      service.detailTask("unassigned", "org-1", { user_id: "user-1", integracaoLevel: 0 }),
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      service.updateTask({
        user_id: "user-1",
        organization_id: "org-1",
        task_id: "unassigned",
        observations: "obs",
        integracaoLevel: 0,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(prismaMock.task.update).not.toHaveBeenCalled();
    prismaMock.task.findFirst.mockResolvedValue({ ...task, responsible2_id: "user-1" });
    await expect(
      service.detailTask("unassigned", "org-1", { user_id: "user-1", integracaoLevel: 0 }),
    ).resolves.toMatchObject({ detail: { responsible_id: null } });
  });
  beforeEach(() => {
    vi.resetAllMocks();
    prismaMock.$transaction.mockImplementation(async (callback) => callback(prismaMock));
    prismaMock.department.findFirst.mockResolvedValue({ id: "dep-1" });
    prismaMock.user.findMany.mockImplementation(async (args) => {
      const ids = (args as { where?: { id?: { in?: string[] } } }).where?.id?.in;
      return (ids ?? ["user-1", "user-model-1", "user-model-2", "user-model-3"]).map((id) => ({
        id,
      }));
    });
  });

  it("createTask rejeita departamento de outra organização mesmo sem responsáveis", async () => {
    prismaMock.project.findFirst.mockResolvedValue({ client_id: "client-1" });
    prismaMock.task.findFirst.mockResolvedValue(null);
    prismaMock.taskModel.findFirst.mockResolvedValue({
      name: "Modelo",
      department_id: "dep-1",
      billing: "Realizar",
      responsible_id: "user-1",
    });
    prismaMock.department.findFirst.mockResolvedValue(null);
    prismaMock.task.create.mockImplementation(async ({ data }) => ({ id: "task-1", ...data }));
    prismaMock.taskDependent.findMany.mockResolvedValue([]);
    await expect(
      new TaskCrudService().createTask({
        user_id: "user-1",
        organization_id: "org-1",
        model_id: "model-1",
        project_id: "project-1",
        client_id: "client-1",
        prospecting_status: "Fechado",
        urgency: "Alta",
        observations: "",
        integracaoLevel: 2,
        department_id: "dep-other-org",
        responsible_id: null,
        responsible2_id: null,
        responsible3_id: null,
      }),
    ).rejects.toMatchObject({ statusCode: 422 });
    expect(prismaMock.department.findFirst).toHaveBeenCalledWith({
      where: { id: "dep-other-org", organization_id: "org-1" },
      select: { id: true },
    });
    expect(prismaMock.task.create).not.toHaveBeenCalled();
  });

  it("updateTask rejeita mudança para departamento de outra organização sem responsáveis", async () => {
    prismaMock.task.findFirst.mockResolvedValue({
      id: "task-1",
      organization_id: "org-1",
      department_id: "dep-1",
      responsible_id: null,
      responsible2_id: null,
      responsible3_id: null,
      status: "Em Andamento",
    });
    prismaMock.department.findFirst.mockResolvedValue(null);
    prismaMock.task.update.mockImplementation(async ({ data }) => data);
    await expect(
      new TaskCrudService().updateTask({
        user_id: "user-1",
        organization_id: "org-1",
        task_id: "task-1",
        integracaoLevel: 2,
        department_id: "dep-other-org",
      }),
    ).rejects.toMatchObject({ statusCode: 422 });
    expect(prismaMock.department.findFirst).toHaveBeenCalledWith({
      where: { id: "dep-other-org", organization_id: "org-1" },
      select: { id: true },
    });
    expect(prismaMock.task.update).not.toHaveBeenCalled();
  });

  it("createTask rejeita desatribuição voluntária quando há responsável elegível", async () => {
    prismaMock.project.findFirst.mockResolvedValue({ client_id: "client-1" });
    prismaMock.task.findFirst.mockResolvedValue(null);
    prismaMock.taskModel.findFirst.mockResolvedValue({
      name: "Modelo",
      department_id: "dep-1",
      billing: "Realizar",
      responsible_id: "legacy-1",
      responsible2_id: "legacy-2",
      responsible3_id: "legacy-3",
    });
    prismaMock.task.create.mockImplementation(async ({ data }) => ({ id: "task-1", ...data }));
    prismaMock.taskDependent.findMany.mockResolvedValue([]);
    prismaMock.user.findMany.mockResolvedValue([{ id: "eligible-1" }]);

    await expect(
      new TaskCrudService().createTask({
        user_id: "user-1",
        organization_id: "org-1",
        model_id: "model-1",
        project_id: "project-1",
        client_id: "client-1",
        prospecting_status: "Fechado",
        department_id: "dep-1",
        urgency: "Alta",
        observations: "",
        integracaoLevel: 2,
        responsible_id: null,
      }),
    ).rejects.toMatchObject({ statusCode: 422 });
    expect(prismaMock.task.create).not.toHaveBeenCalled();
  });

  it("createTask prefere o responsável padrão do modelo quando ele é elegível", async () => {
    prismaMock.project.findFirst.mockResolvedValue({ client_id: "client-1" });
    prismaMock.task.findFirst.mockResolvedValue(null);
    prismaMock.taskModel.findFirst.mockResolvedValue({
      name: "Modelo",
      department_id: "dep-1",
      billing: "Realizar",
      responsible_id: "leader-default",
      responsible2_id: null,
      responsible3_id: null,
    });
    prismaMock.user.findMany.mockResolvedValue([{ id: "leader-default" }, { id: "admin-other" }]);
    prismaMock.task.create.mockImplementation(async ({ data }) => ({ id: "task-1", ...data }));
    prismaMock.taskDependent.findMany.mockResolvedValue([]);

    const result = await new TaskCrudService().createTask({
      user_id: "user-1",
      organization_id: "org-1",
      model_id: "model-1",
      project_id: "project-1",
      client_id: "client-1",
      prospecting_status: "Fechado",
      department_id: "dep-1",
      urgency: "Alta",
      observations: "",
      integracaoLevel: 2,
    });

    expect(prismaMock.taskModel.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "model-1",
          organization_id: "org-1",
          department_id: "dep-1",
          type: "Projeto",
          department: { status: "Ativo" },
        }),
      }),
    );
    expect(prismaMock.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "active",
          department: { id: "dep-1", organization_id: "org-1" },
        }),
      }),
    );
    expect(result.create).toMatchObject({ responsible_id: "leader-default" });
  });

  it("createTask atribui o único candidato elegível quando o padrão não é elegível", async () => {
    prismaMock.project.findFirst.mockResolvedValue({ client_id: "client-1" });
    prismaMock.task.findFirst.mockResolvedValue(null);
    prismaMock.taskModel.findFirst.mockResolvedValue({
      name: "Modelo",
      department_id: "dep-1",
      billing: "Realizar",
      responsible_id: "legacy-default",
      responsible2_id: null,
      responsible3_id: null,
    });
    prismaMock.user.findMany.mockResolvedValue([{ id: "sole-eligible" }]);
    prismaMock.task.create.mockImplementation(async ({ data }) => ({ id: "task-1", ...data }));
    prismaMock.taskDependent.findMany.mockResolvedValue([]);

    const result = await new TaskCrudService().createTask({
      user_id: "user-1",
      organization_id: "org-1",
      model_id: "model-1",
      project_id: "project-1",
      client_id: "client-1",
      prospecting_status: "Fechado",
      department_id: "dep-1",
      urgency: "Alta",
      observations: "",
      integracaoLevel: 2,
    });

    expect(result.create).toMatchObject({ responsible_id: "sole-eligible" });
  });

  it("createTask exige escolha explícita entre múltiplos candidatos sem padrão elegível", async () => {
    prismaMock.project.findFirst.mockResolvedValue({ client_id: "client-1" });
    prismaMock.task.findFirst.mockResolvedValue(null);
    prismaMock.taskModel.findFirst.mockResolvedValue({
      name: "Modelo",
      department_id: "dep-1",
      billing: "Realizar",
      responsible_id: "legacy-default",
    });
    prismaMock.user.findMany.mockResolvedValue([{ id: "leader-1" }, { id: "admin-1" }]);

    await expect(
      new TaskCrudService().createTask({
        user_id: "user-1",
        organization_id: "org-1",
        model_id: "model-1",
        project_id: "project-1",
        client_id: "client-1",
        prospecting_status: "Fechado",
        department_id: "dep-1",
        urgency: "Alta",
        observations: "",
        integracaoLevel: 2,
      }),
    ).rejects.toMatchObject({ statusCode: 422 });
    expect(prismaMock.task.create).not.toHaveBeenCalled();
  });

  it("createTask mantém Sem responsável quando não existe candidato elegível", async () => {
    prismaMock.project.findFirst.mockResolvedValue({ client_id: "client-1" });
    prismaMock.task.findFirst.mockResolvedValue(null);
    prismaMock.taskModel.findFirst.mockResolvedValue({
      name: "Modelo",
      department_id: "dep-1",
      billing: "Realizar",
      responsible_id: "legacy-default",
      responsible2_id: null,
      responsible3_id: null,
    });
    prismaMock.user.findMany.mockResolvedValue([]);
    prismaMock.task.create.mockImplementation(async ({ data }) => ({ id: "task-1", ...data }));
    prismaMock.taskDependent.findMany.mockResolvedValue([]);

    const result = await new TaskCrudService().createTask({
      user_id: "user-1",
      organization_id: "org-1",
      model_id: "model-1",
      project_id: "project-1",
      client_id: "client-1",
      prospecting_status: "Fechado",
      department_id: "dep-1",
      urgency: "Alta",
      observations: "",
      integracaoLevel: 2,
    });

    expect(result.create).toMatchObject({ responsible_id: null });
  });

  it("createTask permite ao wizard desativar somente a expansão de dependências", async () => {
    prismaMock.project.findFirst.mockResolvedValue({ client_id: "client-1" });
    prismaMock.task.findFirst.mockResolvedValue(null);
    prismaMock.taskModel.findFirst.mockResolvedValue({
      name: "Modelo",
      department_id: "dep-1",
      billing: "Realizar",
      responsible_id: "leader-1",
      responsible2_id: null,
      responsible3_id: null,
    });
    prismaMock.user.findMany.mockResolvedValue([{ id: "leader-1" }]);
    prismaMock.task.create.mockImplementation(async ({ data }) => ({ id: "task-1", ...data }));

    const result = await new TaskCrudService().createTask({
      user_id: "user-1",
      organization_id: "org-1",
      model_id: "model-1",
      project_id: "project-1",
      client_id: "client-1",
      prospecting_status: "Fechado",
      name: "Tarefa do wizard",
      status: "Em Espera",
      department_id: "dep-1",
      observations: "",
      urgency: "",
      integracaoLevel: 2,
      createDependencies: false,
    });

    expect(result.create).toMatchObject({
      project_id: "project-1",
      client_id: "client-1",
      status: "Em Espera",
    });
    expect(prismaMock.taskDependent.findMany).not.toHaveBeenCalled();
  });

  it("createTask mantém a expansão de dependências por padrão", async () => {
    prismaMock.project.findFirst.mockResolvedValue({ client_id: "client-1" });
    prismaMock.task.findFirst.mockResolvedValue(null);
    prismaMock.taskModel.findFirst
      .mockResolvedValueOnce({
        name: "Modelo principal",
        department_id: "dep-1",
        billing: "Realizar",
        responsible_id: "leader-1",
        responsible2_id: null,
        responsible3_id: null,
      })
      .mockResolvedValueOnce({
        name: "Modelo dependente",
        department_id: "dep-1",
        billing: "Realizar",
        responsible_id: "leader-1",
        responsible2_id: null,
        responsible3_id: null,
      });
    prismaMock.taskDependent.findMany.mockResolvedValue([
      { dependent_id: "model-2", wait: false, observation: "Dependência padrão" },
    ]);
    prismaMock.task.create.mockImplementation(async ({ data }) => ({ id: "task-1", ...data }));

    await new TaskCrudService().createTask({
      user_id: "user-1",
      organization_id: "org-1",
      model_id: "model-1",
      project_id: "project-1",
      client_id: "client-1",
      prospecting_status: "Fechado",
      observations: "",
      urgency: "Alta",
      integracaoLevel: 2,
    });

    expect(prismaMock.taskDependent.findMany).toHaveBeenCalledWith({
      where: { task_id: "model-1", organization_id: "org-1" },
      select: { dependent_id: true, wait: true, observation: true },
    });
    expect(prismaMock.task.create).toHaveBeenCalledTimes(2);
    expect(prismaMock.task.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          model_id: "model-2",
          project_id: "project-1",
          client_id: "client-1",
        }),
      }),
    );
  });

  it("updateTask permite editar outros campos de tarefa não atribuída sem migrar vínculos legados", async () => {
    prismaMock.department.findFirst.mockResolvedValue(null);
    prismaMock.task.findFirst.mockResolvedValue({
      id: "task-1",
      organization_id: "org-1",
      department_id: "dep-1",
      responsible_id: null,
      responsible2_id: "legacy-outside",
      responsible3_id: null,
      status: "Em Andamento",
    });
    prismaMock.user.findMany.mockResolvedValue([]);
    prismaMock.task.update.mockImplementation(async ({ data }) => data);
    const result = await new TaskCrudService().updateTask({
      user_id: "user-1",
      organization_id: "org-1",
      task_id: "task-1",
      integracaoLevel: 2,
      observations: "observação atualizada",
    });
    expect(result).toMatchObject({
      responsible_id: null,
      responsible2_id: "legacy-outside",
      responsible3_id: null,
      observations: "observação atualizada",
    });
    expect(prismaMock.department.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.user.findMany).not.toHaveBeenCalled();
  });

  it("updateTask ignora mutação direta de responsáveis secundários e preserva legado", async () => {
    prismaMock.task.findFirst.mockResolvedValue({
      id: "task-1",
      organization_id: "org-1",
      model_id: "model-1",
      department_id: "dep-1",
      responsible_id: "leader-1",
      responsible2_id: "legacy-2",
      responsible3_id: null,
      status: "Em Andamento",
    });
    prismaMock.task.update.mockImplementation(async ({ data }) => data);

    const result = await new TaskCrudService().updateTask({
      user_id: "user-1",
      organization_id: "org-1",
      task_id: "task-1",
      responsible2_id: "common-user",
      responsible3_id: "common-user",
      integracaoLevel: 2,
      isOwner: true,
    });

    expect(result).toMatchObject({ responsible2_id: "legacy-2", responsible3_id: null });
    expect(prismaMock.user.findMany).not.toHaveBeenCalled();
  });

  it("updateTask atribui posteriormente um candidato elegível a uma tarefa sem responsável", async () => {
    prismaMock.task.findFirst.mockResolvedValue({
      id: "task-1",
      organization_id: "org-1",
      model_id: "model-1",
      project_id: "project-1",
      department_id: "dep-1",
      responsible_id: null,
      responsible2_id: null,
      responsible3_id: null,
      status: "Em Andamento",
    });
    prismaMock.user.findMany.mockResolvedValue([{ id: "eligible-later" }]);
    prismaMock.task.update.mockImplementation(async ({ data }) => data);

    const result = await new TaskCrudService().updateTask({
      user_id: "user-1",
      organization_id: "org-1",
      task_id: "task-1",
      responsible_id: "eligible-later",
      integracaoLevel: 2,
    });

    expect(result).toMatchObject({ responsible_id: "eligible-later" });
  });

  it("updateTask troca modelo e departamento, limpando vínculos incompatíveis", async () => {
    prismaMock.task.findFirst
      .mockResolvedValueOnce({
        id: "task-1",
        organization_id: "org-1",
        model_id: "model-1",
        project_id: "project-1",
        department_id: "dep-1",
        responsible_id: "legacy-1",
        responsible2_id: "legacy-2",
        responsible3_id: null,
        status: "Em Andamento",
      })
      .mockResolvedValueOnce(null);
    prismaMock.taskModel.findFirst.mockResolvedValue({
      id: "model-2",
      department_id: "dep-2",
      responsible_id: "admin-2",
    });
    prismaMock.user.findMany.mockResolvedValue([{ id: "admin-2" }]);
    prismaMock.task.update.mockImplementation(async ({ data }) => data);

    const result = await new TaskCrudService().updateTask({
      user_id: "user-1",
      organization_id: "org-1",
      task_id: "task-1",
      model_id: "model-2",
      department_id: "dep-2",
      integracaoLevel: 2,
    });

    expect(result).toMatchObject({
      model_id: "model-2",
      department_id: "dep-2",
      responsible_id: "admin-2",
      responsible2_id: null,
      responsible3_id: null,
    });
    expect(prismaMock.task.findFirst).toHaveBeenNthCalledWith(2, {
      where: {
        id: { not: "task-1" },
        organization_id: "org-1",
        project_id: "project-1",
        model_id: "model-2",
        status: { in: ["Em Andamento", "A Realizar", "Em Espera"] },
      },
    });
  });

  it("updateTask rejeita troca para modelo com outra tarefa ativa no projeto", async () => {
    prismaMock.task.findFirst
      .mockResolvedValueOnce({
        id: "task-1",
        organization_id: "org-1",
        model_id: "model-1",
        project_id: "project-1",
        department_id: "dep-1",
        responsible_id: "legacy-1",
        responsible2_id: null,
        responsible3_id: null,
        status: "Em Andamento",
      })
      .mockResolvedValueOnce({ id: "task-2" });
    prismaMock.taskModel.findFirst.mockResolvedValue({
      id: "model-2",
      department_id: "dep-1",
      responsible_id: "admin-1",
    });
    prismaMock.user.findMany.mockResolvedValue([{ id: "admin-1" }]);

    await expect(
      new TaskCrudService().updateTask({
        user_id: "user-1",
        organization_id: "org-1",
        task_id: "task-1",
        model_id: "model-2",
        integracaoLevel: 2,
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: "Tarefa já foi cadastrada em andamento.",
    });

    expect(prismaMock.task.findFirst).toHaveBeenNthCalledWith(2, {
      where: {
        id: { not: "task-1" },
        organization_id: "org-1",
        project_id: "project-1",
        model_id: "model-2",
        status: { in: ["Em Andamento", "A Realizar", "Em Espera"] },
      },
    });
    expect(prismaMock.task.update).not.toHaveBeenCalled();
  });

  it("updateTask converte colisão atômica ao trocar modelo em conflito de domínio", async () => {
    prismaMock.task.findFirst
      .mockResolvedValueOnce({
        id: "task-1",
        organization_id: "org-1",
        model_id: "model-1",
        project_id: "project-1",
        department_id: "dep-1",
        responsible_id: "leader-1",
        responsible2_id: null,
        responsible3_id: null,
        status: "Em Andamento",
      })
      .mockResolvedValueOnce(null);
    prismaMock.taskModel.findFirst.mockResolvedValue({
      id: "model-2",
      responsible_id: "leader-1",
    });
    prismaMock.user.findMany.mockResolvedValue([{ id: "leader-1" }]);
    prismaMock.task.update.mockRejectedValue({ code: "P2002" });

    await expect(
      new TaskCrudService().updateTask({
        user_id: "user-1",
        organization_id: "org-1",
        task_id: "task-1",
        model_id: "model-2",
        integracaoLevel: 2,
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: "Tarefa já foi cadastrada em andamento.",
    });
  });

  it("createTask lança 409 quando já existe tarefa em andamento", async () => {
    prismaMock.project.findFirst.mockResolvedValue({ client_id: "client-1" });
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
        integracaoLevel: 2,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("createTask deixa somente uma criação vencer a corrida do mesmo modelo ativo", async () => {
    prismaMock.project.findFirst.mockResolvedValue({ client_id: "client-1" });
    prismaMock.task.findFirst.mockResolvedValue(null);
    prismaMock.taskModel.findFirst.mockResolvedValue({
      name: "Modelo 1",
      billing: "Não Realizar",
      department_id: "department-1",
      responsible_id: "user-1",
      responsible2_id: null,
      responsible3_id: null,
    });
    prismaMock.taskDependent.findMany.mockResolvedValue([]);
    let activeTaskCreated = false;
    prismaMock.task.create.mockImplementation(async ({ data }) => {
      await Promise.resolve();
      if (activeTaskCreated) {
        throw { code: "P2002" };
      }
      activeTaskCreated = true;
      return { id: "task-winner", ...data };
    });
    const service = new TaskCrudService();
    const input = {
      user_id: "user-1",
      organization_id: "org-1",
      model_id: "model-1",
      project_id: "project-1",
      client_id: "client-1",
      prospecting_status: "Fechado" as const,
      observations: "obs",
      urgency: "Alta",
      integracaoLevel: 2 as const,
    };

    const results = await Promise.allSettled([
      service.createTask(input),
      service.createTask(input),
    ]);

    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    const rejected = results.find(({ status }) => status === "rejected");
    expect(rejected).toMatchObject({
      status: "rejected",
      reason: {
        statusCode: 409,
        message: "Tarefa já foi cadastrada em andamento.",
      },
    });
    expect(prismaMock.task.create).toHaveBeenCalledTimes(2);
  });

  it("createTask rejeita responsaveis ativos fora do departamento da tarefa", async () => {
    prismaMock.project.findFirst.mockResolvedValue({ client_id: "client-1" });
    prismaMock.task.findFirst.mockResolvedValue(null);
    prismaMock.taskModel.findFirst.mockResolvedValue({
      name: "Modelo",
      department_id: "dep-1",
      billing: "Realizar",
      responsible_id: "user-1",
      responsible2_id: null,
      responsible3_id: null,
    });
    prismaMock.user.findMany.mockResolvedValue([]);
    const service = new TaskCrudService();

    await expect(
      service.createTask({
        user_id: "user-1",
        organization_id: "org-1",
        model_id: "model-1",
        project_id: "project-1",
        client_id: "client-1",
        department_id: "dep-1",
        responsible_id: "user-1",
        prospecting_status: "Fechado",
        observations: "obs",
        urgency: "Alta",
        integracaoLevel: 2,
      }),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it("createTask rejeita projeto de outro cliente antes de criar a tarefa", async () => {
    prismaMock.project.findFirst.mockResolvedValue({ client_id: "client-2" });
    prismaMock.task.findFirst.mockResolvedValue(null);
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
        integracaoLevel: 2,
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Projeto nao pertence ao cliente informado.",
    });
    expect(prismaMock.task.create).not.toHaveBeenCalled();
  });

  it("createTask rejeita projeto ausente na organização", async () => {
    prismaMock.project.findFirst.mockResolvedValue(null);
    prismaMock.task.findFirst.mockResolvedValue(null);
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
        integracaoLevel: 2,
      }),
    ).rejects.toMatchObject({
      statusCode: 404,
      message: "Projeto nao encontrado.",
    });
    expect(prismaMock.task.create).not.toHaveBeenCalled();
  });

  it("createTask cria a tarefa quando o projeto pertence ao cliente", async () => {
    prismaMock.project.findFirst.mockResolvedValue({ client_id: "client-1" });
    prismaMock.task.findFirst.mockResolvedValue(null);
    prismaMock.taskModel.findFirst.mockResolvedValue({
      name: "Modelo 1",
      billing: "Não Realizar",
      department_id: "department-1",
      responsible_id: "user-1",
      responsible2_id: null,
      responsible3_id: null,
    });
    prismaMock.task.create.mockResolvedValue({ id: "task-1" });
    prismaMock.taskDependent.findMany.mockResolvedValue([]);
    const service = new TaskCrudService();

    await service.createTask({
      user_id: "user-1",
      organization_id: "org-1",
      model_id: "model-1",
      project_id: "project-1",
      client_id: "client-1",
      prospecting_status: "Fechado",
      observations: "obs",
      urgency: "Alta",
      integracaoLevel: 2,
    });

    expect(prismaMock.project.findFirst).toHaveBeenCalledWith({
      where: { id: "project-1", organization_id: "org-1" },
      select: { client_id: true },
    });
    expect(prismaMock.task.create).toHaveBeenCalledTimes(1);
  });

  it("createTask persists supplied operational details without manual secondary assignments", async () => {
    prismaMock.project.findFirst.mockResolvedValue({ client_id: "client-1" });
    prismaMock.task.findFirst.mockResolvedValue(null);
    prismaMock.taskModel.findFirst.mockResolvedValue({
      name: "Nome do modelo",
      department_id: "department-model",
      billing: "Realizar",
      responsible_id: "user-model-1",
      responsible2_id: "user-model-2",
      responsible3_id: "user-model-3",
    });
    prismaMock.task.create.mockResolvedValue({ id: "task-1" });
    prismaMock.taskDependent.findMany.mockResolvedValue([]);
    workflowMock.afterTaskCreated.mockResolvedValue(undefined);

    const service = new TaskCrudService();

    await service.createTask({
      user_id: "user-creator",
      organization_id: "org-1",
      model_id: "model-1",
      project_id: "project-1",
      client_id: "client-1",
      prospecting_status: "Fechado",
      name: "Nome específico",
      status: "Em Espera",
      department_id: "department-1",
      observations: "Observação específica",
      billing: "Não Realizar",
      urgency: "Alta",
      integracaoLevel: 2,
      responsible_id: "user-1",
      responsible2_id: "user-2",
      responsible3_id: "user-3",
      prevision_date: "2026-08-15",
    });

    expect(prismaMock.task.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "Nome específico",
          status: "Em Espera",
          department_id: "department-1",
          observations: "Observação específica",
          billing: "Não Realizar",
          urgency: "Alta",
          responsible_id: "user-1",
          responsible2_id: null,
          responsible3_id: null,
          prevision_date: new Date("2026-08-15"),
          start_date: null,
          charge_comercial: false,
        }),
      }),
    );
  });

  it("createTask derives the default status from the effective billing", async () => {
    prismaMock.project.findFirst.mockResolvedValue({ client_id: "client-1" });
    prismaMock.task.findFirst.mockResolvedValue(null);
    prismaMock.taskModel.findFirst.mockResolvedValue({
      name: "Nome do modelo",
      department_id: "department-model",
      billing: "Não Realizar",
      responsible_id: "user-model-1",
      responsible2_id: null,
      responsible3_id: null,
    });
    prismaMock.task.create.mockResolvedValue({ id: "task-1" });
    prismaMock.taskDependent.findMany.mockResolvedValue([]);
    workflowMock.afterTaskCreated.mockResolvedValue(undefined);

    await new TaskCrudService().createTask({
      user_id: "user-creator",
      organization_id: "org-1",
      model_id: "model-1",
      project_id: "project-1",
      client_id: "client-1",
      prospecting_status: "Fechado",
      observations: "obs",
      urgency: "Alta",
      billing: "Realizar",
      status: "Em Andamento",
      integracaoLevel: 2,
    });

    expect(prismaMock.task.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "Em Espera",
          billing: "Realizar",
          charge_comercial: true,
          charge_financeiro: false,
        }),
      }),
    );
  });

  it("updateTask não libera tarefa de cobrança pendente para execução", async () => {
    prismaMock.task.findFirst.mockResolvedValue({
      id: "task-1",
      organization_id: "org-1",
      department_id: "dep-1",
      responsible_id: "user-1",
      status: "Em Espera",
      billing: "Realizar",
      hiring_status: "A Realizar",
    });

    await expect(
      new TaskCrudService().updateTask({
        user_id: "user-1",
        organization_id: "org-1",
        task_id: "task-1",
        status: "Em Andamento",
        integracaoLevel: 2,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(prismaMock.task.update).not.toHaveBeenCalled();
  });

  it("updateTask não permite remover a cobrança Realizar antes da validação Comercial", async () => {
    prismaMock.task.findFirst.mockResolvedValue({
      id: "task-1",
      organization_id: "org-1",
      department_id: "dep-1",
      responsible_id: "user-1",
      status: "Em Espera",
      billing: "Realizar",
      hiring_status: null,
    });

    await expect(
      new TaskCrudService().updateTask({
        user_id: "user-1",
        organization_id: "org-1",
        task_id: "task-1",
        billing: "Não Realizar",
        integracaoLevel: 2,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(prismaMock.task.update).not.toHaveBeenCalled();
  });

  it("createTask preserves no-charge behavior for a Não Realizar task in Em Espera", async () => {
    prismaMock.project.findFirst.mockResolvedValue({ client_id: "client-1" });
    prismaMock.task.findFirst.mockResolvedValue(null);
    prismaMock.taskModel.findFirst.mockResolvedValue({
      name: "Nome do modelo",
      department_id: "department-model",
      billing: "Não Realizar",
      responsible_id: "user-model-1",
      responsible2_id: null,
      responsible3_id: null,
    });
    prismaMock.task.create.mockResolvedValue({ id: "task-1" });
    prismaMock.taskDependent.findMany.mockResolvedValue([]);
    workflowMock.afterTaskCreated.mockResolvedValue(undefined);

    await new TaskCrudService().createTask({
      user_id: "user-creator",
      organization_id: "org-1",
      model_id: "model-1",
      project_id: "project-1",
      client_id: "client-1",
      prospecting_status: "Fechado",
      observations: "obs",
      urgency: "Alta",
      status: "Em Espera",
      integracaoLevel: 2,
    });

    expect(prismaMock.task.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ charge_comercial: false, charge_financeiro: false }),
      }),
    );
  });

  it("createTask preserva defaults legados quando chamado pelo fluxo automático de plano", async () => {
    prismaMock.project.findFirst.mockResolvedValue({ client_id: "client-1" });
    prismaMock.task.findFirst.mockResolvedValue(null);
    prismaMock.taskModel.findFirst.mockResolvedValue({
      name: "Nome do modelo",
      department_id: "department-model",
      billing: "Não Realizar",
      responsible_id: "user-model-1",
      responsible2_id: "user-model-2",
      responsible3_id: "user-model-3",
    });
    prismaMock.task.create.mockResolvedValue({ id: "task-1" });
    prismaMock.taskDependent.findMany.mockResolvedValue([]);
    workflowMock.afterTaskCreated.mockResolvedValue(undefined);

    await new TaskCrudService().createTask({
      user_id: "user-creator",
      organization_id: "org-1",
      model_id: "model-1",
      project_id: "project-1",
      client_id: "client-1",
      prospecting_status: "Fechado",
      observations: "obs",
      urgency: "Alta",
      integracaoLevel: 2,
    });

    expect(prismaMock.task.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "Nome do modelo",
          department_id: "department-model",
          billing: "Não Realizar",
          responsible_id: "user-model-1",
          responsible2_id: "user-model-2",
          responsible3_id: "user-model-3",
        }),
      }),
    );
    expect(prismaMock.taskModel.findFirst).toHaveBeenCalledWith({
      where: { id: "model-1", organization_id: "org-1" },
    });
  });

  it("detailTask lança 404 quando tarefa não existe", async () => {
    prismaMock.task.findFirst.mockResolvedValue(null);
    const service = new TaskCrudService();

    await expect(service.detailTask("task-1", "org-1")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("detailTask expõe se a validação Comercial ainda bloqueia a execução", async () => {
    prismaMock.task.findFirst.mockResolvedValue({
      id: "task-1",
      organization_id: "org-1",
      billing: "Realizar",
      hiring_status: "A Realizar",
      responsible_id: null,
      responsible2_id: null,
      responsible3_id: null,
    });

    await expect(
      new TaskCrudService().detailTask("task-1", "org-1", {
        user_id: "owner-1",
        integracaoLevel: 3,
        isOwner: true,
      }),
    ).resolves.toMatchObject({
      detail: { commercial_validation_pending: true },
    });
  });

  it("listTasks calcula totais sobre todos os registros filtrados", async () => {
    const pageRows = [
      {
        id: "task-21",
        name: "Registro 21",
        status: "Em Andamento",
        billing: "Realizar",
        hiring_status: "Contratado",
        client: { name: "Empresa", company_name: null },
        project: { name: "Projeto" },
        responsible_id: "other-user",
        responsible2_id: null,
        responsible3_id: null,
      },
    ];
    prismaMock.task.findMany.mockResolvedValue(pageRows);
    prismaMock.task.count
      .mockResolvedValueOnce(41)
      .mockResolvedValueOnce(9)
      .mockResolvedValueOnce(14);
    const service = new TaskCrudService();

    const result = await service.listTasks({
      organization_id: "org-1",
      user_id: "user-1",
      status: "Todos",
      ref: "",
      ref_id: "",
      search: "registro",
      page: 2,
      limit: 20,
      integracaoLevel: 1,
    });

    expect(result).toEqual({
      data: [
        {
          id: "task-21",
          name: "Registro 21",
          status: "Em Andamento",
          billing: "Realizar",
          hiring_status: "Contratado",
          client_name: "Empresa",
          project_name: "Projeto",
          isOwn: false,
          isUnassigned: false,
        },
      ],
      total: 41,
      hasMore: true,
      summary: { inProgress: 9, billable: 14 },
    });
    expect(prismaMock.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 20 }),
    );
    expect(prismaMock.task.count).toHaveBeenNthCalledWith(1, {
      where: expect.objectContaining({
        organization_id: "org-1",
        OR: [{ name: { contains: "registro", mode: "insensitive" } }],
      }),
    });
    expect(prismaMock.task.count).toHaveBeenNthCalledWith(2, {
      where: {
        AND: [
          expect.objectContaining({
            organization_id: "org-1",
            OR: [{ name: { contains: "registro", mode: "insensitive" } }],
          }),
          { status: { contains: "andamento", mode: "insensitive" } },
          {
            OR: [{ billing: { not: "Realizar" } }, { hiring_status: "Contratado" }],
          },
        ],
      },
    });
    expect(prismaMock.task.count).toHaveBeenNthCalledWith(3, {
      where: {
        AND: [
          expect.objectContaining({
            organization_id: "org-1",
            OR: [{ name: { contains: "registro", mode: "insensitive" } }],
          }),
          { NOT: { billing: { contains: "não", mode: "insensitive" } } },
        ],
      },
    });
  });

  it("listTasks filtra serviços únicos contratados e retorna empresa e projeto", async () => {
    prismaMock.task.findMany.mockResolvedValue([
      {
        id: "task-unique-1",
        name: "Regularização especial",
        status: "Em Andamento",
        billing: "Realizar",
        hiring_status: "Contratado",
        client: { name: "Empresa", company_name: "Empresa Alfa" },
        project: { name: "Projeto migração" },
        responsible_id: "user-2",
        responsible2_id: null,
        responsible3_id: null,
      },
    ]);
    prismaMock.task.count.mockResolvedValue(1);

    const result = await new TaskCrudService().listTasks({
      organization_id: "org-1",
      user_id: "user-1",
      status: "Todos",
      ref: "",
      ref_id: "",
      search: "",
      unique_service_released: true,
      page: 1,
      limit: 20,
      integracaoLevel: 1,
    });

    expect(result.data).toMatchObject([
      {
        id: "task-unique-1",
        client_name: "Empresa Alfa",
        project_name: "Projeto migração",
      },
    ]);
    expect(prismaMock.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organization_id: "org-1",
          hiring_status: "Contratado",
          client: { is: { service_unique: true } },
        },
        select: expect.objectContaining({
          client: { select: { name: true, company_name: true } },
          project: { select: { name: true } },
        }),
      }),
    );
  });

  it("listTasks apresenta tarefas Realizar legadas como Em Espera até a contratação", async () => {
    prismaMock.task.findMany.mockResolvedValue([
      {
        id: "task-legacy",
        name: "Serviço avulso existente",
        status: "Em Andamento",
        billing: "Realizar",
        hiring_status: null,
        client: { name: "Empresa", company_name: null },
        project: { name: "Projeto" },
        responsible_id: "user-1",
        responsible2_id: null,
        responsible3_id: null,
      },
    ]);
    prismaMock.task.count.mockResolvedValue(1);

    const result = await new TaskCrudService().listTasks({
      organization_id: "org-1",
      user_id: "user-1",
      status: "Todos",
      ref: "",
      ref_id: "",
      search: "",
      page: 1,
      limit: 20,
      integracaoLevel: 2,
    });

    expect(result.data).toMatchObject([
      { id: "task-legacy", status: "Em Espera", billing: "Realizar" },
    ]);
    expect(prismaMock.task.count).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({
              OR: expect.arrayContaining([
                { billing: { not: "Realizar" } },
                { hiring_status: "Contratado" },
              ]),
            }),
          ]),
        }),
      }),
    );
  });

  it("listTasks não inclui tarefas pendentes de contratação no filtro Em Andamento", async () => {
    prismaMock.task.findMany.mockResolvedValue([]);
    prismaMock.task.count.mockResolvedValue(0);

    await new TaskCrudService().listTasks({
      organization_id: "org-1",
      user_id: "user-1",
      status: "Em Andamento",
      ref: "",
      ref_id: "",
      search: "",
      page: 1,
      limit: 20,
      integracaoLevel: 2,
    });

    expect(prismaMock.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "Em Andamento",
          AND: expect.arrayContaining([
            expect.objectContaining({
              OR: expect.arrayContaining([
                { billing: { not: "Realizar" } },
                { hiring_status: "Contratado" },
              ]),
            }),
          ]),
        }),
      }),
    );
  });

  it("listTasks inclui tarefas Realizar legadas no filtro Em Espera", async () => {
    prismaMock.task.findMany.mockResolvedValue([]);
    prismaMock.task.count.mockResolvedValue(0);

    await new TaskCrudService().listTasks({
      organization_id: "org-1",
      user_id: "user-1",
      status: "Em Espera",
      ref: "",
      ref_id: "",
      search: "",
      page: 1,
      limit: 20,
      integracaoLevel: 2,
    });

    expect(prismaMock.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({
              OR: expect.arrayContaining([
                { status: "Em Espera" },
                {
                  AND: [
                    { status: { in: ["Em Andamento", "A Realizar", "Em Espera"] } },
                    {
                      billing: "Realizar",
                      OR: [{ hiring_status: null }, { hiring_status: { not: "Contratado" } }],
                    },
                  ],
                },
              ]),
            }),
          ]),
        }),
      }),
    );
  });

  it("listTasks compõe cliente e tarefas sem responsável com o escopo da organização", async () => {
    const clientId = "11111111-1111-4111-8111-111111111111";
    prismaMock.client.findFirst.mockResolvedValue({ id: clientId });
    prismaMock.task.findMany.mockResolvedValue([
      {
        id: "task-1",
        client: { name: "Empresa", company_name: null },
        project: { name: "Projeto" },
        responsible_id: null,
        responsible2_id: null,
        responsible3_id: null,
      },
    ]);
    prismaMock.task.count.mockResolvedValue(1);

    const result = await new TaskCrudService().listTasks({
      organization_id: "org-1",
      user_id: "user-1",
      status: "Todos",
      ref: "",
      ref_id: "",
      search: "",
      client_id: clientId,
      assignment: "unassigned",
      page: 1,
      limit: 20,
      integracaoLevel: 2,
    });

    expect(prismaMock.client.findFirst).toHaveBeenCalledWith({
      where: { id: clientId, organization_id: "org-1" },
      select: { id: true },
    });
    expect(prismaMock.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organization_id: "org-1",
          client_id: clientId,
          responsible_id: null,
        },
      }),
    );
    expect(result.data[0]).toMatchObject({ id: "task-1", isOwn: false, isUnassigned: true });
  });

  it("listTasks não consulta tarefas quando o cliente não pertence à organização", async () => {
    prismaMock.client.findFirst.mockResolvedValue(null);

    await expect(
      new TaskCrudService().listTasks({
        organization_id: "org-1",
        user_id: "user-1",
        status: "Todos",
        ref: "",
        ref_id: "",
        search: "",
        client_id: "11111111-1111-4111-8111-111111111111",
        page: 1,
        limit: 20,
        integracaoLevel: 2,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(prismaMock.task.findMany).not.toHaveBeenCalled();
  });

  it("listTasks mantém a responsabilidade própria quando nível 0 pesquisa", async () => {
    prismaMock.task.findMany.mockResolvedValue([]);
    prismaMock.task.count.mockResolvedValue(0);
    const service = new TaskCrudService();

    await service.listTasks({
      organization_id: "org-1",
      user_id: "user-1",
      status: "Todos",
      ref: "",
      ref_id: "",
      search: "registro",
      page: 1,
      limit: 20,
      integracaoLevel: 0,
    });

    expect(prismaMock.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organization_id: "org-1",
          AND: [
            { status: { in: ["Em Andamento", "A Realizar", "Em Espera"] } },
            {
              OR: [
                { responsible_id: "user-1" },
                { responsible2_id: "user-1" },
                { responsible3_id: "user-1" },
              ],
            },
            { OR: [{ name: { contains: "registro", mode: "insensitive" } }] },
          ],
        },
      }),
    );
  });

  it("listTasks reutiliza o filtro de tarefas próprias nos totais", async () => {
    prismaMock.task.findMany.mockResolvedValue([
      {
        id: "task-1",
        name: "Tarefa própria",
        client: { name: "Empresa", company_name: null },
        project: { name: "Projeto" },
        responsible_id: "user-1",
        responsible2_id: null,
        responsible3_id: null,
      },
    ]);
    prismaMock.task.count
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1);
    const service = new TaskCrudService();

    const result = await service.listTasks({
      organization_id: "org-1",
      user_id: "user-1",
      status: "Todos",
      ref: "",
      ref_id: "",
      search: "própria",
      page: 1,
      limit: 20,
      integracaoLevel: 0,
    });

    const ownTaskWhere = {
      organization_id: "org-1",
      AND: [
        { status: { in: ["Em Andamento", "A Realizar", "Em Espera"] } },
        {
          OR: [
            { responsible_id: "user-1" },
            { responsible2_id: "user-1" },
            { responsible3_id: "user-1" },
          ],
        },
        { OR: [{ name: { contains: "própria", mode: "insensitive" } }] },
      ],
    };

    expect(result).toMatchObject({
      total: 1,
      summary: { inProgress: 1, billable: 1 },
    });
    expect(prismaMock.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: ownTaskWhere, skip: 0, take: 20 }),
    );
    expect(prismaMock.task.count).toHaveBeenNthCalledWith(1, { where: ownTaskWhere });
    expect(prismaMock.task.count).toHaveBeenNthCalledWith(2, {
      where: {
        AND: [
          ownTaskWhere,
          { status: { contains: "andamento", mode: "insensitive" } },
          {
            OR: [{ billing: { not: "Realizar" } }, { hiring_status: "Contratado" }],
          },
        ],
      },
    });
    expect(prismaMock.task.count).toHaveBeenNthCalledWith(3, {
      where: {
        AND: [ownTaskWhere, { NOT: { billing: { contains: "não", mode: "insensitive" } } }],
      },
    });
  });

  it.each([
    "responsible_id",
    "responsible2_id",
    "responsible3_id",
  ] as const)("listTasks marca tarefa própria quando o usuário é %s", async (responsibleField) => {
    prismaMock.task.findMany.mockResolvedValue([
      {
        id: "task-1",
        name: "Tarefa própria",
        client: { name: "Empresa", company_name: null },
        project: { name: "Projeto" },
        [responsibleField]: "user-1",
      },
    ]);
    prismaMock.task.count.mockResolvedValue(1);
    const service = new TaskCrudService();

    const result = await service.listTasks({
      organization_id: "org-1",
      user_id: "user-1",
      status: "Todos",
      ref: "",
      ref_id: "",
      search: "",
      page: 1,
      limit: 20,
      integracaoLevel: 1,
    });

    expect(result.data[0]).toMatchObject({ id: "task-1", isOwn: true });
    expect(result.data[0]).not.toHaveProperty("responsible_id");
    expect(result.data[0]).not.toHaveProperty("responsible2_id");
    expect(result.data[0]).not.toHaveProperty("responsible3_id");
  });

  it("listTasks marca como não própria uma tarefa de outro usuário", async () => {
    prismaMock.task.findMany.mockResolvedValue([
      {
        id: "task-1",
        name: "Tarefa de terceiro",
        client: { name: "Empresa", company_name: null },
        project: { name: "Projeto" },
        responsible_id: "other-user",
        responsible2_id: null,
        responsible3_id: null,
      },
    ]);
    prismaMock.task.count.mockResolvedValue(1);
    const service = new TaskCrudService();

    const result = await service.listTasks({
      organization_id: "org-1",
      user_id: "user-1",
      status: "Todos",
      ref: "",
      ref_id: "",
      search: "",
      page: 1,
      limit: 20,
      integracaoLevel: 1,
    });

    expect(result.data[0]).toMatchObject({ id: "task-1", isOwn: false });
  });

  it("não permite concluir diretamente uma tarefa, inclusive para proprietário", async () => {
    prismaMock.task.findFirst.mockResolvedValue({
      organization_id: "org-1",
      name: "Tarefa",
      status: "Em Andamento",
      responsible_id: "user-1",
      responsible2_id: null,
      responsible3_id: null,
    });
    const service = new TaskCrudService();

    await expect(
      service.updateTask({
        user_id: "user-1",
        organization_id: "org-1",
        task_id: "task-1",
        status: "Concluída",
        integracaoLevel: 3,
        isOwner: true,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(prismaMock.task.update).not.toHaveBeenCalled();
  });

  it("não permite reabrir diretamente uma tarefa concluída", async () => {
    prismaMock.task.findFirst.mockResolvedValue({
      organization_id: "org-1",
      name: "Tarefa",
      status: "Concluída",
      responsible_id: "user-1",
      responsible2_id: null,
      responsible3_id: null,
    });

    await expect(
      new TaskCrudService().updateTask({
        user_id: "user-1",
        organization_id: "org-1",
        task_id: "task-1",
        status: "Em Andamento",
        integracaoLevel: 3,
        isOwner: true,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(prismaMock.task.update).not.toHaveBeenCalled();
  });

  it("detailTask permite nível 0 apenas para um dos três responsáveis", async () => {
    prismaMock.task.findFirst.mockResolvedValue({
      id: "task-1",
      organization_id: "org-1",
      responsible_id: "user-1",
      responsible2_id: null,
      responsible3_id: null,
    });
    const service = new TaskCrudService();

    await expect(
      service.detailTask("task-1", "org-1", {
        user_id: "user-1",
        integracaoLevel: 0,
      }),
    ).resolves.toMatchObject({ detail: { id: "task-1" } });

    prismaMock.task.findFirst.mockResolvedValue({
      id: "task-1",
      organization_id: "org-1",
      responsible_id: "other-user",
      responsible2_id: null,
      responsible3_id: null,
    });
    await expect(
      service.detailTask("task-1", "org-1", {
        user_id: "user-1",
        integracaoLevel: 0,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
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
        integracaoLevel: 1,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});
