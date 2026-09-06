import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, auditMock, workflowMock } = vi.hoisted(() => ({
  prismaMock: {
    department: {
      findFirst: vi.fn(),
    },
    project: {
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

import { TaskCrudService } from "../services/taskCrudService.js";

describe("TaskCrudService", () => {
  it.each([
    { integracaoLevel: 1 as const },
    { integracaoLevel: 2 as const },
    { integracaoLevel: 3 as const },
    { integracaoLevel: 0 as const, isOwner: true },
  ])("leitura de tarefa não atribuída respeita escopo: %j", async (authorization) => {
    const task = {
      id: "unassigned",
      organization_id: "org-1",
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
    prismaMock.department.findFirst.mockResolvedValue({ id: "dep-1" });
    prismaMock.user.findMany.mockImplementation(async (args) =>
      ((args as { where?: { id?: { in?: string[] } } }).where?.id?.in ?? []).map((id) => ({ id })),
    );
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

  it("createTask preserva null explícito sem herdar responsáveis do modelo", async () => {
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
    const result = await new TaskCrudService().createTask({
      user_id: "user-1",
      organization_id: "org-1",
      model_id: "model-1",
      project_id: "project-1",
      client_id: "client-1",
      prospecting_status: "Fechado",
      urgency: "Alta",
      observations: "",
      integracaoLevel: 2,
      responsible_id: null,
      responsible2_id: null,
      responsible3_id: null,
    });
    expect(result.create).toMatchObject({
      responsible_id: null,
      responsible2_id: null,
      responsible3_id: null,
    });
    expect(prismaMock.user.findMany).not.toHaveBeenCalled();
  });

  it("updateTask desatribui o principal sem revalidar ou alterar vínculos legados", async () => {
    prismaMock.department.findFirst.mockResolvedValue(null);
    prismaMock.task.findFirst.mockResolvedValue({
      id: "task-1",
      organization_id: "org-1",
      department_id: "dep-1",
      responsible_id: "legacy-1",
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
      responsible_id: null,
    });
    expect(result).toMatchObject({
      responsible_id: null,
      responsible2_id: "legacy-outside",
      responsible3_id: null,
    });
    expect(prismaMock.department.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.user.findMany).not.toHaveBeenCalled();
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

  it("createTask persists supplied operational details instead of model defaults", async () => {
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
          responsible2_id: "user-2",
          responsible3_id: "user-3",
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
      integracaoLevel: 2,
    });

    expect(prismaMock.task.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "A Realizar", billing: "Realizar" }),
      }),
    );
  });

  it("createTask disables charges for an Em Espera task regardless of billing", async () => {
    prismaMock.project.findFirst.mockResolvedValue({ client_id: "client-1" });
    prismaMock.task.findFirst.mockResolvedValue(null);
    prismaMock.taskModel.findFirst.mockResolvedValue({
      name: "Nome do modelo",
      department_id: "department-model",
      billing: "Realizar",
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

  it("createTask retains model defaults when optional details are omitted", async () => {
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
  });

  it("detailTask lança 404 quando tarefa não existe", async () => {
    prismaMock.task.findFirst.mockResolvedValue(null);
    const service = new TaskCrudService();

    await expect(service.detailTask("task-1", "org-1")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("listTasks calcula totais sobre todos os registros filtrados", async () => {
    const pageRows = [
      {
        id: "task-21",
        name: "Registro 21",
        status: "Em Andamento",
        billing: "Realizar",
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
          isOwn: false,
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
        AND: [ownTaskWhere, { status: { contains: "andamento", mode: "insensitive" } }],
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

  it("não permite concluir diretamente uma tarefa sem o fluxo de aprovação", async () => {
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
        integracaoLevel: 2,
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
