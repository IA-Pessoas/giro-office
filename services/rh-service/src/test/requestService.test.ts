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

  it("create persiste responsável nulo quando payload não informa responsável", async () => {
    prismaMock.rhCategory.findFirst.mockResolvedValue({ id: "cat-1" });
    prismaMock.rhRequest.create.mockResolvedValue({
      id: "req-1",
      assigned_to_user_id: null,
    });
    const service = new RequestService();

    const result = await service.create({
      organization_id: "org-1",
      requester_user_id: "user-1",
      title: "Solicitação",
      description: "Descrição",
      category_id: "cat-1",
      urgency: "High",
    });

    expect(prismaMock.user.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.rhRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ assigned_to_user_id: null }),
      }),
    );
    expect(result).toMatchObject({ assigned_to_user_id: null });
  });

  it("update altera outros campos quando a solicitação permanece sem responsável", async () => {
    prismaMock.rhRequest.findFirst.mockResolvedValue({
      id: "req-1",
      requester_user_id: "user-1",
      assigned_to_user_id: null,
    });
    prismaMock.rhRequest.update.mockResolvedValue({
      id: "req-1",
      status: "In_Progress",
      assigned_to_user_id: null,
    });
    const service = new RequestService();

    await expect(
      service.update({ id: "req-1", organization_id: "org-1", status: "In_Progress" }),
    ).resolves.toMatchObject({ assigned_to_user_id: null });
    expect(prismaMock.rhRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "In_Progress" } }),
    );
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
