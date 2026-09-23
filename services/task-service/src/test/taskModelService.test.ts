import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, auditMock } = vi.hoisted(() => ({
  prismaMock: {
    taskModel: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      delete: vi.fn(),
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
}));

vi.mock("../prisma/index.js", () => ({ default: prismaMock }));
vi.mock("../integrations/audit.js", () => auditMock);

import { TaskModelService } from "../services/taskModelService.js";

describe("TaskModelService", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("createModel lança 409 quando já existe modelo com mesmo nome", async () => {
    prismaMock.taskModel.findFirst.mockResolvedValue({ id: "model-1" });
    const service = new TaskModelService(prismaMock as never, auditMock as never);

    await expect(
      service.createModel({
        user_id: "user-1",
        organization_id: "org-1",
        name: "Modelo",
        department_id: "dep-1",
        responsible_id: "user-1",
        billing: "Realizar",
        prevision: 2,
        integracaoLevel: 3,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("createModel rejeita responsável 3 sem responsável 2 antes de consultar o banco", async () => {
    const service = new TaskModelService(prismaMock as never, auditMock as never);

    await expect(
      service.createModel({
        user_id: "user-1",
        organization_id: "org-1",
        name: "Modelo",
        department_id: "dep-1",
        responsible_id: "user-1",
        responsible2_id: null,
        responsible3_id: "user-3",
        billing: "Realizar",
        prevision: 2,
        integracaoLevel: 3,
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Responsável 2 é obrigatório antes do responsável 3.",
    });

    expect(prismaMock.taskModel.findFirst).not.toHaveBeenCalled();
  });

  it("updateModel rejeita responsável 2 quando o responsável principal está ausente", async () => {
    const service = new TaskModelService(prismaMock as never, auditMock as never);

    await expect(
      service.updateModel({
        user_id: "user-1",
        organization_id: "org-1",
        task_id: "model-1",
        name: "Modelo",
        department_id: "dep-1",
        responsible_id: "",
        responsible2_id: "user-2",
        billing: "Realizar",
        prevision: 2,
        integracaoLevel: 3,
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Responsável é obrigatório.",
    });

    expect(prismaMock.taskModel.findFirst).not.toHaveBeenCalled();
  });

  it("detailModel lança 404 quando modelo não existe", async () => {
    prismaMock.taskModel.findFirst.mockResolvedValue(null);
    const service = new TaskModelService(prismaMock as never, auditMock as never);

    await expect(service.detailModel("model-1", "org-1")).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("createModel rejeita responsaveis ativos fora do departamento do modelo", async () => {
    prismaMock.taskModel.findFirst.mockResolvedValue(null);
    prismaMock.taskModel.create.mockResolvedValue({ id: "model-1" });
    prismaMock.user.findMany.mockResolvedValue([]);
    const service = new TaskModelService(prismaMock as never, auditMock as never);

    await expect(
      service.createModel({
        user_id: "user-1",
        organization_id: "org-1",
        name: "Modelo",
        department_id: "dep-1",
        responsible_id: "user-1",
        billing: "Realizar",
        prevision: 2,
        integracaoLevel: 3,
      }),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it("listModel lista todos os modelos da organizacao quando filtros nao sao informados", async () => {
    prismaMock.taskModel.findMany.mockResolvedValue([{ id: "model-1", name: "Modelo" }]);
    const service = new TaskModelService(prismaMock as never, auditMock as never);

    const result = await service.listModel({
      organizationId: "org-1",
      paginationRequested: false,
      search: "",
      page: 1,
      limit: 20,
      userId: "user-1",
      integracaoLevel: 2,
    });

    expect(result).toEqual([{ id: "model-1", name: "Modelo" }]);
    expect(prismaMock.taskModel.findMany).toHaveBeenCalledWith({
      where: {
        organization_id: "org-1",
      },
      select: {
        id: true,
        name: true,
        department_id: true,
        responsible_id: true,
        department: {
          select: {
            id: true,
            name: true,
            users: {
              where: {
                status: "active",
                AND: [
                  { OR: [{ organization_id: "org-1" }, { organization_id: null }] },
                  {
                    OR: [
                      { type: "admin" },
                      {
                        permissions: {
                          some: { organization_id: "org-1", rh: { gte: 3 } },
                        },
                      },
                    ],
                  },
                ],
              },
              select: { id: true, name: true },
              orderBy: { name: "asc" },
            },
          },
        },
      },
      orderBy: { name: "asc" },
    });
  });

  it("listModel busca por modelo ou departamento antes de paginar", async () => {
    const row = { id: "model-21", name: "Fiscal 21", department_id: "dep-1" };
    prismaMock.taskModel.findMany.mockResolvedValue([row]);
    prismaMock.taskModel.count.mockResolvedValue(21);
    const service = new TaskModelService(prismaMock as never, auditMock as never);

    const result = await service.listModel({
      organizationId: "org-1",
      paginationRequested: true,
      search: "fiscal",
      page: 2,
      limit: 20,
      userId: "user-1",
      integracaoLevel: 2,
    });

    const where = {
      organization_id: "org-1",
      OR: [
        { name: { contains: "fiscal", mode: "insensitive" } },
        { department: { name: { contains: "fiscal", mode: "insensitive" } } },
      ],
    };
    expect(prismaMock.taskModel.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where, skip: 20, take: 20 }),
    );
    expect(prismaMock.taskModel.count).toHaveBeenCalledWith({ where });
    expect(result).toEqual({
      data: [row],
      total: 21,
      page: 2,
      limit: 20,
      hasMore: false,
    });
  });

  it("listModel limita modelos de projeto a departamentos ativos", async () => {
    prismaMock.taskModel.findMany.mockResolvedValue([]);
    const service = new TaskModelService(prismaMock as never, auditMock as never);

    await service.listModel({
      organizationId: "org-1",
      type: "Projeto",
      paginationRequested: false,
      search: "",
      page: 1,
      limit: 20,
      userId: "user-1",
      integracaoLevel: 2,
    });

    expect(prismaMock.taskModel.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organization_id: "org-1",
          type: "Projeto",
          department: { status: "Ativo" },
        },
      }),
    );
  });

  it("createModel lança 403 quando usuário não tem permissão", async () => {
    prismaMock.taskModel.findFirst.mockResolvedValueOnce(null);
    prismaMock.user.findFirst.mockResolvedValue({ id: "user-1", permission: 1 });
    const service = new TaskModelService(prismaMock as never, auditMock as never);

    await expect(
      service.createModel({
        user_id: "user-1",
        organization_id: "org-1",
        name: "Modelo",
        department_id: "dep-1",
        responsible_id: "user-1",
        billing: "Realizar",
        prevision: 2,
        integracaoLevel: 2,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("updateModel lança 403 quando usuário não tem permissão", async () => {
    prismaMock.taskModel.findFirst.mockResolvedValue({
      id: "model-1",
      organization_id: "org-1",
    });
    prismaMock.user.findFirst.mockResolvedValue({ id: "user-1", permission: 1 });
    const service = new TaskModelService(prismaMock as never, auditMock as never);

    await expect(
      service.updateModel({
        user_id: "user-1",
        organization_id: "org-1",
        task_id: "model-1",
        name: "Modelo",
        department_id: "dep-1",
        responsible_id: "user-1",
        billing: "Realizar",
        prevision: 2,
        integracaoLevel: 1,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("deleteModel lança 403 quando usuário não tem permissão", async () => {
    prismaMock.taskModel.findFirst.mockResolvedValue({
      id: "model-1",
      organization_id: "org-1",
    });
    prismaMock.user.findFirst.mockResolvedValue({ id: "user-1", permission: 1 });
    const service = new TaskModelService(prismaMock as never, auditMock as never);

    await expect(
      service.deleteModel({
        task_id: "model-1",
        user_id: "user-1",
        organization_id: "org-1",
        integracaoLevel: 1,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});
