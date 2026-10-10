import "./envBootstrap.js";

import { describe, expect, it, vi } from "vitest";

import { RegularizePortfolioReportingService } from "../reporting/internalReportingService.js";

const organizationId = "10000000-0000-4000-8000-000000000001";

function prismaWith(overrides: Record<string, unknown>) {
  const empty = { findMany: vi.fn().mockResolvedValue([]) };
  return {
    client: empty,
    clientsGroup: empty,
    clientSegment: empty,
    passwordRegularize: empty,
    ...overrides,
  } as never;
}

describe("RegularizePortfolioReportingService", () => {
  it("lê a carteira pela organização e traduz o estado legado P", async () => {
    const findMany = vi.fn().mockResolvedValue([
      { id: "c1", name: "Alfa", status: "P" },
      { id: "c2", name: "Beta", status: "Ativo" },
      { id: "c3", name: "Gama", status: "Inativo" },
    ]);
    const service = new RegularizePortfolioReportingService(prismaWith({ client: { findMany } }));

    await expect(
      service.extract({
        organizationId,
        source: "regularize.clients",
        fields: ["name", "status"],
        limit: 2,
      }),
    ).resolves.toEqual({
      rows: [
        { name: "Alfa", status: "Processo de Inativação" },
        { name: "Beta", status: "Ativo" },
      ],
      reachedLimit: true,
    });
    expect(findMany).toHaveBeenCalledWith({
      where: { organization_id: organizationId },
      select: { id: true, name: true, status: true },
      orderBy: { id: "asc" },
      take: 4,
    });
  });

  it("deriva tipo de segmento e pendência de senhas sem expor colunas internas", async () => {
    const clients = vi.fn().mockResolvedValue([
      { id: "c1", name: "Alfa", segment: "padaria" },
      { id: "c2", name: "Beta", segment: null },
    ]);
    const segments = vi.fn().mockResolvedValue([{ name: "Padaria", type: "Comércio" }]);
    const passwords = vi.fn().mockResolvedValue([{ client_id: "c2" }]);
    const service = new RegularizePortfolioReportingService(
      prismaWith({
        client: { findMany: clients },
        clientSegment: { findMany: segments },
        passwordRegularize: { findMany: passwords },
      }),
    );

    await expect(
      service.extract({
        organizationId,
        source: "regularize.clients",
        fields: ["name", "segment_type", "has_passwords"],
        limit: 10,
      }),
    ).resolves.toEqual({
      rows: [
        { name: "Alfa", segment_type: "Comércio", has_passwords: false },
        { name: "Beta", segment_type: null, has_passwords: true },
      ],
      reachedLimit: false,
    });
    expect(clients.mock.calls[0]?.[0].select).toEqual({ id: true, name: true, segment: true });
    expect(segments).toHaveBeenCalledWith({
      where: { organization_id: organizationId },
      select: { name: true, type: true },
    });
    expect(passwords).toHaveBeenCalledWith({
      where: { organization_id: organizationId, client_id: { in: ["c1", "c2"] } },
      select: { client_id: true },
      distinct: ["client_id"],
    });
  });

  it("aplica os mesmos filtros e totais à carteira e aos grupos", async () => {
    const clients = [
      { id: "c1", name: "Alfa", status: "P", licitacao: true },
      { id: "c2", name: "Beta", status: "Ativo", licitacao: true },
      { id: "c3", name: "Gama", status: "Inativo", licitacao: false },
    ];
    const pick = (row: Record<string, unknown>, select: Record<string, unknown>) =>
      Object.fromEntries(Object.keys(select).map((key) => [key, row[key]]));
    const clientFindMany = vi.fn(async ({ select }) => clients.map((row) => pick(row, select)));
    const groupFindMany = vi.fn(async ({ select }) =>
      clients.map((row, index) => ({
        id: `m${index}`,
        group: { name: "Grupo Norte", status: true },
        client: pick(row, select.client.select),
      })),
    );
    const prisma = prismaWith({
      client: { findMany: clientFindMany },
      clientsGroup: { findMany: groupFindMany },
    }) as { $transaction?: unknown };
    prisma.$transaction = async (read: (transaction: unknown) => unknown) => read(prisma);
    const service = new RegularizePortfolioReportingService(prisma as never);
    const query = {
      filters: [
        {
          field: "status",
          operator: "in",
          parameter: "status",
          value: ["Ativo", "Processo de Inativação"],
        },
        { field: "licitacao", operator: "eq", parameter: "licitacao", value: true },
      ],
      aggregations: [{ field: "name", function: "count" as const, alias: "total" }],
    };

    for (const source of ["regularize.clients", "regularize.client_groups"] as const) {
      await expect(
        service.extract({ organizationId, source, fields: ["name"], limit: 10, query }),
      ).resolves.toEqual({ rows: [{ total: 2 }], reachedLimit: false });
    }
    expect(groupFindMany.mock.calls[0]?.[0].where).toEqual({
      organization_id: organizationId,
      group: { is: { organization_id: organizationId } },
      client: { is: { organization_id: organizationId } },
    });
  });

  it("projeta o grupo junto dos dados do cliente", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "m1",
        group: { name: "Grupo Norte", status: false },
        client: { id: "c1", name: "Alfa" },
      },
    ]);
    const service = new RegularizePortfolioReportingService(
      prismaWith({ clientsGroup: { findMany } }),
    );

    await expect(
      service.extract({
        organizationId,
        source: "regularize.client_groups",
        fields: ["group_name", "group_active", "name"],
        limit: 10,
      }),
    ).resolves.toEqual({
      rows: [{ group_name: "Grupo Norte", group_active: false, name: "Alfa" }],
      reachedLimit: false,
    });
  });

  it("rejeita chaves internas e campos não publicados", async () => {
    const findMany = vi.fn();
    const service = new RegularizePortfolioReportingService(prismaWith({ client: { findMany } }));

    await expect(
      service.extract({
        organizationId,
        source: "regularize.clients",
        fields: ["client_id"],
        limit: 10,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(findMany).not.toHaveBeenCalled();
  });
});
