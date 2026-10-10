import "./envBootstrap.js";

import { describe, expect, it, vi } from "vitest";

import { RegularizePortfolioReportingService } from "../reporting/internalReportingService.js";

const organizationId = "10000000-0000-4000-8000-000000000001";

function prismaWith(overrides: Record<string, unknown>) {
  const empty = { findMany: vi.fn().mockResolvedValue([]) };
  const prisma = {
    client: empty,
    clientPF: empty,
    clientsGroup: empty,
    clientSegment: empty,
    partners: empty,
    passwordRegularize: empty,
    ...overrides,
  } as Record<string, unknown>;
  prisma.$transaction = async (read: (transaction: unknown) => unknown) => read(prisma);
  return prisma as never;
}

describe("RegularizePortfolioReportingService — PF e sócios", () => {
  it("deriva empresa vigente, empresa ativa e mês de aniversário da PF", async () => {
    const clientPF = vi.fn().mockResolvedValue([
      { id: "pf1", name: "Ana", status: "Ativo", date_of_birth: new Date("1990-03-15T00:00:00Z") },
      { id: "pf2", name: "Bia", status: "IRPF", date_of_birth: new Date("1985-12-01T00:00:00Z") },
      { id: "pf3", name: "Caio", status: "Ativo", date_of_birth: new Date("1970-07-30T00:00:00Z") },
    ]);
    // pf1: sócia vigente de empresa ativa; pf2: só de empresa em inativação; pf3: sem empresa.
    const partners = vi.fn().mockResolvedValue([
      { pf_id: "pf1", clientPJ: { status: "Ativo" } },
      { pf_id: "pf1", clientPJ: { status: "Inativo" } },
      { pf_id: "pf2", clientPJ: { status: "P" } },
    ]);
    const service = new RegularizePortfolioReportingService(
      prismaWith({ clientPF: { findMany: clientPF }, partners: { findMany: partners } }),
    );

    await expect(
      service.extract({
        organizationId,
        source: "regularize.clients_pf",
        fields: ["name", "status", "has_company", "has_active_company", "birth_month"],
        limit: 10,
      }),
    ).resolves.toEqual({
      rows: [
        {
          name: "Ana",
          status: "Ativo",
          has_company: true,
          has_active_company: true,
          birth_month: 3,
        },
        {
          name: "Bia",
          status: "IRPF",
          has_company: true,
          has_active_company: false,
          birth_month: 12,
        },
        {
          name: "Caio",
          status: "Ativo",
          has_company: false,
          has_active_company: false,
          birth_month: 7,
        },
      ],
      reachedLimit: false,
    });
    expect(clientPF).toHaveBeenCalledWith({
      where: { organization_id: organizationId },
      select: { id: true, name: true, status: true, date_of_birth: true },
      orderBy: { id: "asc" },
      take: 12,
    });
    expect(partners).toHaveBeenCalledWith({
      where: {
        organization_id: organizationId,
        pf_id: { in: ["pf1", "pf2", "pf3"] },
        exit: null,
        clientPJ: { is: { organization_id: organizationId } },
      },
      select: { pf_id: true, clientPJ: { select: { status: true } } },
    });
  });

  it("lista sócios com a empresa e separa vínculo vigente de encerrado", async () => {
    const partners = vi.fn().mockResolvedValue([
      {
        id: "s1",
        part: 60,
        entry: new Date("2020-01-10T00:00:00Z"),
        exit: null,
        clientPF: { name: "Ana", cpf: "11111111111", sex: "F" },
        clientPJ: { name: "Alfa", company_name: "Alfa Ltda", cpf_cnpj: "1", status: "P" },
      },
      {
        id: "s2",
        part: 40,
        entry: new Date("2019-05-01T00:00:00Z"),
        exit: new Date("2024-02-01T00:00:00Z"),
        clientPF: { name: "Davi", cpf: "22222222222", sex: "M" },
        clientPJ: { name: "Beta", company_name: null, cpf_cnpj: "2", status: "Ativo" },
      },
    ]);
    const service = new RegularizePortfolioReportingService(
      prismaWith({ partners: { findMany: partners } }),
    );

    await expect(
      service.extract({
        organizationId,
        source: "regularize.partners",
        fields: ["partner_name", "partner_sex", "company_name", "company_status", "active", "part"],
        limit: 10,
      }),
    ).resolves.toEqual({
      rows: [
        {
          partner_name: "Ana",
          partner_sex: "F",
          company_name: "Alfa Ltda",
          company_status: "Processo de Inativação",
          active: true,
          part: 60,
        },
        {
          partner_name: "Davi",
          partner_sex: "M",
          company_name: "Beta",
          company_status: "Ativo",
          active: false,
          part: 40,
        },
      ],
      reachedLimit: false,
    });
    expect(partners.mock.calls[0]?.[0].where).toEqual({
      organization_id: organizationId,
      clientPF: { is: { organization_id: organizationId } },
      clientPJ: { is: { organization_id: organizationId } },
    });
  });

  it("filtra sócias vigentes e fecha o total com a tabela", async () => {
    const partners = vi.fn(async () => [
      {
        id: "s1",
        entry: new Date("2020-01-10T00:00:00Z"),
        exit: null,
        clientPF: { name: "Ana", sex: "F" },
        clientPJ: {},
      },
      {
        id: "s2",
        entry: new Date("2020-01-10T00:00:00Z"),
        exit: null,
        clientPF: { name: "Davi", sex: "M" },
        clientPJ: {},
      },
      {
        id: "s3",
        entry: new Date("2020-01-10T00:00:00Z"),
        exit: new Date("2024-02-01T00:00:00Z"),
        clientPF: { name: "Eva", sex: "F" },
        clientPJ: {},
      },
    ]);
    const service = new RegularizePortfolioReportingService(
      prismaWith({ partners: { findMany: partners } }),
    );
    const filters = [
      { field: "partner_sex", operator: "eq", parameter: "sexo", value: "F" },
      { field: "active", operator: "eq", parameter: "vigente", value: true },
    ];

    await expect(
      service.extract({
        organizationId,
        source: "regularize.partners",
        fields: ["partner_name"],
        limit: 10,
        query: { filters },
      }),
    ).resolves.toEqual({ rows: [{ partner_name: "Ana" }], reachedLimit: false });
    await expect(
      service.extract({
        organizationId,
        source: "regularize.partners",
        fields: ["partner_name"],
        limit: 10,
        query: {
          filters,
          aggregations: [{ field: "partner_name", function: "count", alias: "total" }],
        },
      }),
    ).resolves.toEqual({ rows: [{ total: 1 }], reachedLimit: false });
  });

  it("marca empresa sem sócio vigente e publica os contatos da carteira", async () => {
    const client = vi.fn().mockResolvedValue([
      { id: "c1", name: "Alfa", email: "alfa@exemplo.test", number: "7199990000" },
      { id: "c2", name: "Beta", email: null, number: null },
    ]);
    const partners = vi.fn().mockResolvedValue([{ pj_id: "c1" }]);
    const service = new RegularizePortfolioReportingService(
      prismaWith({ client: { findMany: client }, partners: { findMany: partners } }),
    );

    await expect(
      service.extract({
        organizationId,
        source: "regularize.clients",
        fields: ["name", "email", "number", "has_partners"],
        limit: 10,
      }),
    ).resolves.toEqual({
      rows: [
        { name: "Alfa", email: "alfa@exemplo.test", number: "7199990000", has_partners: true },
        { name: "Beta", email: null, number: null, has_partners: false },
      ],
      reachedLimit: false,
    });
    expect(partners).toHaveBeenCalledWith({
      where: { organization_id: organizationId, pj_id: { in: ["c1", "c2"] }, exit: null },
      select: { pj_id: true },
      distinct: ["pj_id"],
    });
  });

  it("não publica documentos da PF fora do catálogo", async () => {
    const clientPF = vi.fn();
    const service = new RegularizePortfolioReportingService(
      prismaWith({ clientPF: { findMany: clientPF } }),
    );

    await expect(
      service.extract({
        organizationId,
        source: "regularize.clients_pf",
        fields: ["mother"],
        limit: 10,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(clientPF).not.toHaveBeenCalled();
  });
});
