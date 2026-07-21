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

  it("list aplica busca no banco antes de paginar", async () => {
    prismaMock.organization.findMany.mockResolvedValue([{ id: "org-1", name: "Giro Office" }]);
    prismaMock.organization.count.mockResolvedValue(1);
    const service = new OrganizationService();

    const result = await service.list({
      page: 2,
      pageSize: 10,
      search: "giro",
      status: "active",
    });

    const expectedWhere = {
      status: "active",
      OR: [
        { name: { contains: "giro", mode: "insensitive" } },
        { slug: { contains: "giro", mode: "insensitive" } },
        { cnpj: { contains: "giro", mode: "insensitive" } },
        { email_created_by: { contains: "giro", mode: "insensitive" } },
        { subscription_plan: { contains: "giro", mode: "insensitive" } },
      ],
    };

    expect(prismaMock.organization.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expectedWhere,
        skip: 10,
        take: 10,
      }),
    );
    expect(prismaMock.organization.count).toHaveBeenCalledWith({ where: expectedWhere });
    expect(result.total).toBe(1);
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
