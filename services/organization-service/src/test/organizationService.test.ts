import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    organization: {
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("../integrations/prisma.js", () => ({
  prismaClient: prismaMock,
}));

import { OrganizationService } from "../services/organizationService.js";

describe("OrganizationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("list retorna paginação de organizações", async () => {
    prismaMock.organization.findMany.mockResolvedValue([{ id: "org-1" }]);
    prismaMock.organization.count.mockResolvedValue(1);
    const service = new OrganizationService();

    const result = await service.list({ page: 1, pageSize: 10 });

    expect(result).toEqual({
      organizations: [{ id: "org-1" }],
      total: 1,
      page: 1,
      pageSize: 10,
    });
  });

  it("list legado preserva projeção, filtro e ordenação originais", async () => {
    prismaMock.organization.findMany.mockResolvedValue([{ id: "org-1" }]);
    prismaMock.organization.count.mockResolvedValue(1);
    const service = new OrganizationService();

    await service.list({ page: 2, pageSize: 10, status: "active" });

    const expectedWhere = { status: "active" };
    expect(prismaMock.organization.findMany).toHaveBeenCalledWith({
      where: expectedWhere,
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        subscription_plan: true,
        logo_url: true,
        cnpj: true,
        email_created_by: true,
        created_at: true,
        updated_at: true,
      },
      orderBy: { created_at: "desc" },
      skip: 10,
      take: 10,
    });
    expect(prismaMock.organization.count).toHaveBeenCalledWith({ where: expectedWhere });
  });

  it("listPlatform filtra antes da paginação e ordena organizações de forma estável", async () => {
    prismaMock.organization.findMany.mockResolvedValue([{ id: "org-2", name: "Castelo" }]);
    prismaMock.organization.count.mockResolvedValue(1);
    const service = new OrganizationService();

    await service.listPlatform({ page: 2, pageSize: 20, search: "Castelo" });

    const expectedWhere = {
      OR: [
        { name: { contains: "Castelo", mode: "insensitive" } },
        { slug: { contains: "Castelo", mode: "insensitive" } },
        { cnpj: { contains: "Castelo", mode: "insensitive" } },
      ],
    };
    expect(prismaMock.organization.findMany).toHaveBeenCalledWith({
      where: expectedWhere,
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        subscription_plan: true,
        logo_url: true,
        cnpj: true,
        created_at: true,
        updated_at: true,
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      skip: 20,
      take: 20,
    });
    expect(prismaMock.organization.count).toHaveBeenCalledWith({ where: expectedWhere });
  });

  it("create lança 409 quando slug já existe", async () => {
    prismaMock.organization.findUnique.mockResolvedValue({ id: "org-1" });
    const service = new OrganizationService();

    await expect(
      service.create({
        name: "Empresa Teste",
        email_created_by: "admin@example.com",
        cnpj: "12345678000199",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("findById lança 404 quando organização não existe", async () => {
    prismaMock.organization.findUnique.mockResolvedValue(null);
    const service = new OrganizationService();

    await expect(service.findById("org-1")).rejects.toMatchObject({ statusCode: 404 });
  });
});
