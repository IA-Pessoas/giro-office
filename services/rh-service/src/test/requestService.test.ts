import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    rhCategory: {
      findFirst: vi.fn(),
    },
    user: {
      findFirst: vi.fn(),
    },
    rhRequest: {
      create: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock("../integrations/prisma.js", () => ({
  prismaClient: prismaMock,
}));

import { RequestService } from "../services/requestService.js";

describe("RequestService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("create lança 400 quando responsável é o mesmo solicitante", async () => {
    prismaMock.rhCategory.findFirst.mockResolvedValue({ id: "cat-1" });
    const service = new RequestService();

    await expect(
      service.create({
        organization_id: "org-1",
        requester_user_id: "user-1",
        title: "Solicitação",
        description: "Descrição",
        category_id: "cat-1",
        assigned_to_user_id: "user-1",
        urgency: "High",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("create atribui automaticamente um responsavel RH elegivel quando payload nao informa responsavel", async () => {
    prismaMock.rhCategory.findFirst.mockResolvedValue({ id: "cat-1" });
    prismaMock.user.findFirst.mockResolvedValue({ id: "rh-user-1" });
    prismaMock.rhRequest.create.mockResolvedValue({
      id: "req-1",
      assigned_to_user_id: "rh-user-1",
    });
    const service = new RequestService();

    const result = await service.create({
      organization_id: "org-1",
      requester_user_id: "user-1",
      title: "Solicitacao",
      description: "Descricao",
      category_id: "cat-1",
      urgency: "High",
    });

    expect(prismaMock.user.findFirst).toHaveBeenCalledWith({
      where: {
        status: "active",
        id: { not: "user-1" },
        OR: [
          { organization_id: "org-1" },
          { organization_id: null, department: { organization_id: "org-1" } },
        ],
        permissions: { some: { organization_id: "org-1", rh: { gte: 1 } } },
      },
      orderBy: { name: "asc" },
      select: { id: true },
    });
    expect(prismaMock.rhRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ assigned_to_user_id: "rh-user-1" }),
      }),
    );
    expect(result).toMatchObject({ assigned_to_user_id: "rh-user-1" });
  });

  it("getById lança 404 quando solicitação não existe", async () => {
    prismaMock.rhRequest.findFirst.mockResolvedValue(null);
    const service = new RequestService();

    await expect(service.getById("req-1", "org-1")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("list retorna o solicitante historico sem depender de usuarios ativos", async () => {
    prismaMock.rhRequest.findMany.mockResolvedValue([
      {
        id: "req-1",
        requester_user_id: "legacy-user-1",
        requester: { id: "legacy-user-1", name: "Maria Legado", status: "inactive" },
      },
    ]);
    prismaMock.rhRequest.count.mockResolvedValue(21);
    const service = new RequestService();

    const result = await service.list("org-1", { status: "New", page: 2, limit: 20 });

    const where = { organization_id: "org-1", status: "New" };

    expect(prismaMock.rhRequest.findMany).toHaveBeenCalledWith({
      where,
      orderBy: { created_at: "desc" },
      skip: 20,
      take: 20,
      select: expect.objectContaining({
        requester: { select: { id: true, name: true, status: true } },
      }),
    });
    expect(prismaMock.rhRequest.count).toHaveBeenCalledWith({ where });
    expect(result).toEqual({
      items: [
        {
          id: "req-1",
          requester_user_id: "legacy-user-1",
          requester: { id: "legacy-user-1", name: "Maria Legado", status: "inactive" },
        },
      ],
      total: 21,
      page: 2,
      pageSize: 20,
      hasMore: false,
    });
  });
});
