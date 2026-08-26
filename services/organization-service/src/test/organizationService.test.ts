import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    organization: {
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
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
    vi.resetAllMocks();
    prismaMock.organization.findFirst.mockResolvedValue(null);
    prismaMock.organization.findUnique.mockResolvedValue(null);
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
        cnpj: "11222333000181",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  describe.each(["legacy", "platform"] as const)("criação %s", (writer) => {
    function create(service: OrganizationService, cnpj: string) {
      return writer === "legacy"
        ? service.create({ name: "Nova Empresa", cnpj, email_created_by: "admin@example.com" })
        : service.createPlatform({
            name: "Nova Empresa",
            cnpj,
            emailCreatedBy: "admin@example.com",
            actorPlatformUserId: "platform-user-1",
          });
    }

    it.each([
      "11222333000181",
      "11.222.333/0001-81",
    ])("persiste CNPJ canônico para entrada %s", async (cnpj) => {
      prismaMock.organization.create.mockResolvedValue({
        id: "org-new",
        status: "active",
        subscription_plan: "trial",
      });

      await create(new OrganizationService(), cnpj);

      expect(prismaMock.organization.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ cnpj: "11222333000181" }) }),
      );
      expect(prismaMock.organization.findFirst).toHaveBeenCalledWith({
        where: { cnpj: { in: ["11222333000181", "11.222.333/0001-81"] } },
        select: { id: true },
      });
    });

    it.each([
      ["11222333000181", "11222333000181"],
      ["11222333000181", "11.222.333/0001-81"],
      ["11.222.333/0001-81", "11222333000181"],
      ["11.222.333/0001-81", "11.222.333/0001-81"],
    ])("rejeita entrada %s quando já existe %s sem criar ou auditar", async (input, stored) => {
      prismaMock.organization.findFirst.mockImplementation(async ({ where }) =>
        where.cnpj.in.includes(stored) ? { id: "org-existing" } : null,
      );
      prismaMock.organization.create.mockResolvedValue({
        id: "org-duplicate",
        status: "active",
        subscription_plan: "trial",
      });
      const audit = vi.fn();

      await expect(create(new OrganizationService(audit), input)).rejects.toMatchObject({
        statusCode: 409,
      });
      expect(prismaMock.organization.create).not.toHaveBeenCalled();
      expect(audit).not.toHaveBeenCalled();
    });

    it.each(["cnpj", "slug"])("converte corrida P2002 de %s em 409 sem auditar", async (field) => {
      prismaMock.organization.create.mockRejectedValue({
        code: "P2002",
        meta: { target: [field] },
      });
      const audit = vi.fn();

      await expect(create(new OrganizationService(audit), "11222333000181")).rejects.toMatchObject({
        statusCode: 409,
      });
      expect(prismaMock.organization.create).toHaveBeenCalledTimes(1);
      expect(audit).not.toHaveBeenCalled();
    });
  });

  it("findById lança 404 quando organização não existe", async () => {
    prismaMock.organization.findUnique.mockResolvedValue(null);
    const service = new OrganizationService();

    await expect(service.findById("org-1")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("createPlatform persiste defaults seguros e audita sem CNPJ ou e-mail", async () => {
    // Falha detectada: criação aceita defaults implícitos ou vaza identidade/CNPJ na auditoria.
    const createdAt = new Date("2026-08-25T12:00:00.000Z");
    const organization = {
      id: "org-1",
      name: "Empresa Teste",
      slug: "empresa-teste",
      status: "active",
      subscription_plan: "trial",
      logo_url: null,
      cnpj: "11222333000181",
      created_at: createdAt,
      updated_at: createdAt,
    };
    const audit = vi.fn().mockResolvedValue(undefined);
    prismaMock.organization.create.mockResolvedValue(organization);
    const service = new OrganizationService(audit);

    const result = await service.createPlatform({
      name: "Empresa Teste",
      cnpj: "11222333000181",
      emailCreatedBy: "admin@example.com",
      actorPlatformUserId: "platform-user-1",
    });

    expect(result).toEqual(organization);
    expect(result).not.toHaveProperty("email_created_by");
    expect(prismaMock.organization.create).toHaveBeenCalledWith({
      data: {
        name: "Empresa Teste",
        slug: "empresa-teste",
        email_created_by: "admin@example.com",
        cnpj: "11222333000181",
        status: "active",
        subscription_plan: "trial",
      },
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
    });
    expect(audit).toHaveBeenCalledWith({
      actorPlatformUserId: "platform-user-1",
      organizationId: "org-1",
      action: "organization.created",
      changes: {
        status: { from: null, to: "active" },
        subscription_plan: { from: null, to: "trial" },
      },
    });
  });

  it("createPlatform converte corrida de unicidade P2002 em 409", async () => {
    // Falha detectada: slug ou CNPJ duplicado em corrida retorna 500.
    prismaMock.organization.create.mockRejectedValue({ code: "P2002" });
    const service = new OrganizationService();

    await expect(
      service.createPlatform({
        name: "Empresa Teste",
        cnpj: "11222333000181",
        emailCreatedBy: "admin@example.com",
        actorPlatformUserId: "platform-user-1",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("findPlatformById retorna 404 sem expor a projeção legada", async () => {
    // Falha detectada: detalhe inexistente retorna 500 ou consulta campos privados.
    prismaMock.organization.findUnique.mockResolvedValue(null);
    const service = new OrganizationService();

    await expect(service.findPlatformById("org-1")).rejects.toMatchObject({ statusCode: 404 });
    expect(prismaMock.organization.findUnique).toHaveBeenCalledWith({
      where: { id: "org-1" },
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
    });
  });

  it("updatePlatformStatus usa id e timestamp no write e audita somente status", async () => {
    // Falha detectada: uma edição concorrente é sobrescrita ou campos fora da allowlist são auditados.
    const beforeUpdatedAt = new Date("2026-08-25T12:00:00.000Z");
    const afterUpdatedAt = new Date("2026-08-25T12:01:00.000Z");
    const before = {
      id: "org-1",
      name: "Empresa Teste",
      slug: "empresa-teste",
      status: "active",
      subscription_plan: "trial",
      logo_url: null,
      cnpj: "11222333000181",
      created_at: beforeUpdatedAt,
      updated_at: beforeUpdatedAt,
    };
    const after = { ...before, status: "suspended", updated_at: afterUpdatedAt };
    const audit = vi.fn().mockResolvedValue(undefined);
    prismaMock.organization.findUnique.mockResolvedValueOnce(before);
    prismaMock.organization.update.mockResolvedValue(after);
    const service = new OrganizationService(audit);

    const result = await service.updatePlatformStatus({
      id: "org-1",
      status: "suspended",
      expectedUpdatedAt: beforeUpdatedAt.toISOString(),
      actorPlatformUserId: "platform-user-1",
    });

    expect(result).toEqual(after);
    expect(prismaMock.organization.update).toHaveBeenCalledWith({
      where: { id: "org-1", updated_at: beforeUpdatedAt },
      data: { status: "suspended" },
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
    });
    expect(prismaMock.organization.findUnique).toHaveBeenCalledTimes(1);
    expect(audit).toHaveBeenCalledWith({
      actorPlatformUserId: "platform-user-1",
      organizationId: "org-1",
      action: "organization.status.updated",
      changes: { status: { from: "active", to: "suspended" } },
    });
  });

  it("updatePlatformSubscriptionPlan retorna 409 para timestamp obsoleto", async () => {
    // Falha detectada: update com expected_updated_at obsoleto sobrescreve a alteração mais recente.
    const updatedAt = new Date("2026-08-25T12:00:00.000Z");
    prismaMock.organization.findUnique.mockResolvedValue({
      id: "org-1",
      subscription_plan: "trial",
      updated_at: updatedAt,
    });
    prismaMock.organization.update.mockRejectedValue({ code: "P2025" });
    const service = new OrganizationService();

    await expect(
      service.updatePlatformSubscriptionPlan({
        id: "org-1",
        subscriptionPlan: "pro",
        expectedUpdatedAt: updatedAt.toISOString(),
        actorPlatformUserId: "platform-user-1",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(prismaMock.organization.findUnique).toHaveBeenCalledTimes(1);
  });

  it("updatePlatformLogoUrl mantém sucesso quando a auditoria pós-commit falha", async () => {
    // Falha detectada: indisponibilidade da auditoria desfaz ou converte uma mutação já persistida em erro.
    const beforeUpdatedAt = new Date("2026-08-25T12:00:00.000Z");
    const afterUpdatedAt = new Date("2026-08-25T12:01:00.000Z");
    const before = {
      id: "org-1",
      name: "Empresa Teste",
      slug: "empresa-teste",
      status: "active",
      subscription_plan: "trial",
      logo_url: null,
      cnpj: "11222333000181",
      created_at: beforeUpdatedAt,
      updated_at: beforeUpdatedAt,
    };
    const after = {
      ...before,
      logo_url: "https://cdn.example.com/logo.png",
      updated_at: afterUpdatedAt,
    };
    const audit = vi.fn().mockRejectedValue(new Error("audit unavailable"));
    prismaMock.organization.findUnique.mockResolvedValueOnce(before);
    prismaMock.organization.update.mockResolvedValue(after);
    const service = new OrganizationService(audit);

    await expect(
      service.updatePlatformLogoUrl({
        id: "org-1",
        logoUrl: "https://cdn.example.com/logo.png",
        expectedUpdatedAt: beforeUpdatedAt.toISOString(),
        actorPlatformUserId: "platform-user-1",
      }),
    ).resolves.toEqual(after);
    expect(prismaMock.organization.findUnique).toHaveBeenCalledTimes(1);
    expect(audit).toHaveBeenCalledWith({
      actorPlatformUserId: "platform-user-1",
      organizationId: "org-1",
      action: "organization.logo_url.updated",
      changes: {
        logo_url: { from: null, to: "https://cdn.example.com/logo.png" },
      },
    });
  });
});
