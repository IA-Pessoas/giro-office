import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, auditMock, workflowMock } = vi.hoisted(() => ({
  prismaMock: {
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
  beforeEach(() => {
    vi.clearAllMocks();
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
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
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
      }),
    ).rejects.toMatchObject({
      statusCode: 404,
      message: "Projeto nao encontrado.",
    });
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
    });

    expect(prismaMock.project.findFirst).toHaveBeenCalledWith({
      where: { id: "project-1", organization_id: "org-1" },
      select: { client_id: true },
    });
    expect(prismaMock.task.create).toHaveBeenCalledTimes(1);
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
      status: "Todos",
      ref: "",
      ref_id: "",
      search: "registro",
      page: 2,
      limit: 20,
    });

    expect(result).toEqual({
      data: pageRows,
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
