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

  it("não reaproveita o catálogo de segmentos entre organizações na mesma instância", async () => {
    const otherOrganizationId = "20000000-0000-4000-8000-000000000002";
    const clients = vi.fn().mockResolvedValue([{ id: "c1", segment: "Padaria" }]);
    const segments = vi.fn(async ({ where }: { where: { organization_id: string } }) => [
      {
        name: "Padaria",
        type: where.organization_id === organizationId ? "Comércio" : "Indústria",
      },
    ]);
    const service = new RegularizePortfolioReportingService(
      prismaWith({ client: { findMany: clients }, clientSegment: { findMany: segments } }),
    );
    const extract = (organization: string) =>
      service.extract({
        organizationId: organization,
        source: "regularize.clients",
        fields: ["segment_type"],
        limit: 10,
      });

    await expect(extract(organizationId)).resolves.toMatchObject({
      rows: [{ segment_type: "Comércio" }],
    });
    await expect(extract(otherOrganizationId)).resolves.toMatchObject({
      rows: [{ segment_type: "Indústria" }],
    });
  });

  it("trata departamento não marcado como falso e preserva licitação não informada", async () => {
    const findMany = vi.fn().mockResolvedValue([
      { id: "c1", fiscal: null, contabil: true, licitacao: null },
      { id: "c2", fiscal: false, contabil: null, licitacao: false },
    ]);
    const service = new RegularizePortfolioReportingService(prismaWith({ client: { findMany } }));

    await expect(
      service.extract({
        organizationId,
        source: "regularize.clients",
        fields: ["fiscal", "contabil", "licitacao"],
        limit: 10,
      }),
    ).resolves.toMatchObject({
      rows: [
        { fiscal: false, contabil: true, licitacao: null },
        { fiscal: false, contabil: false, licitacao: false },
      ],
    });
  });

  it("mantém status desconhecido como veio do cadastro", async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: "c1", status: "constructor" }]);
    const service = new RegularizePortfolioReportingService(prismaWith({ client: { findMany } }));

    await expect(
      service.extract({
        organizationId,
        source: "regularize.clients",
        fields: ["status"],
        limit: 10,
      }),
    ).resolves.toMatchObject({ rows: [{ status: "constructor" }] });
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

  describe("lista DTE por UF", () => {
    // Regra do legado (relatorios/estados.php): ativo ou em inativação, segmento de comércio
    // ou indústria e inscrição estadual diferente de ISENTO.
    const clients = [
      {
        id: "c1",
        name: "Comércio BA",
        status: "Ativo",
        state: "BA",
        segment: "Padaria",
        state_registration: "123",
      },
      {
        id: "c2",
        name: "Indústria em inativação",
        status: "P",
        state: "BA",
        segment: "Fábrica",
        state_registration: "456",
      },
      {
        id: "c3",
        name: "Isenta",
        status: "Ativo",
        state: "BA",
        segment: "Padaria",
        state_registration: " isento ",
      },
      {
        id: "c4",
        name: "Serviço",
        status: "Ativo",
        state: "BA",
        segment: "Consultoria",
        state_registration: "789",
      },
      {
        id: "c5",
        name: "Inativa",
        status: "Inativo",
        state: "BA",
        segment: "Padaria",
        state_registration: "321",
      },
      {
        id: "c6",
        name: "Sem inscrição",
        status: "Ativo",
        state: "BA",
        segment: "Padaria",
        state_registration: null,
      },
      {
        id: "c7",
        name: "Sem segmento",
        status: "Ativo",
        state: "BA",
        segment: null,
        state_registration: "654",
      },
      {
        id: "c8",
        name: "Comércio sem UF",
        status: "Ativo",
        state: null,
        segment: "Padaria",
        state_registration: "987",
      },
      {
        id: "c9",
        name: "Comércio PE",
        status: "Ativo",
        state: "PE",
        segment: "padaria",
        state_registration: "111",
      },
    ];
    const segments = [
      { name: "Padaria", type: "comercio" },
      { name: "Fábrica", type: "industria" },
      { name: "Consultoria", type: "servico" },
    ];
    const pick = (row: Record<string, unknown>, select: Record<string, unknown>) =>
      Object.fromEntries(Object.keys(select).map((key) => [key, row[key]]));
    const build = () => {
      const prisma = prismaWith({
        client: { findMany: vi.fn(async ({ select }) => clients.map((row) => pick(row, select))) },
        clientSegment: { findMany: vi.fn().mockResolvedValue(segments) },
      }) as { $transaction?: unknown };
      prisma.$transaction = async (read: (transaction: unknown) => unknown) => read(prisma);
      return new RegularizePortfolioReportingService(prisma as never);
    };

    it("marca os elegíveis e diz o que falta no cadastro", async () => {
      const result = await build().extract({
        organizationId,
        source: "regularize.clients",
        fields: ["name", "dte_eligible", "dte_missing_data"],
        limit: 20,
      });

      expect(result.rows).toEqual([
        { name: "Comércio BA", dte_eligible: true, dte_missing_data: null },
        { name: "Indústria em inativação", dte_eligible: true, dte_missing_data: null },
        { name: "Isenta", dte_eligible: false, dte_missing_data: null },
        { name: "Serviço", dte_eligible: false, dte_missing_data: null },
        { name: "Inativa", dte_eligible: false, dte_missing_data: null },
        // Sem inscrição entra, como no PHP (vazio é diferente de ISENTO), e fica sinalizado.
        { name: "Sem inscrição", dte_eligible: true, dte_missing_data: "Inscrição estadual" },
        { name: "Sem segmento", dte_eligible: false, dte_missing_data: "Segmento" },
        { name: "Comércio sem UF", dte_eligible: true, dte_missing_data: "UF" },
        { name: "Comércio PE", dte_eligible: true, dte_missing_data: null },
      ]);
    });

    it("aplica a mesma regra aos clientes dentro dos grupos e ignora espaços no segmento", async () => {
      const members = vi.fn().mockResolvedValue([
        {
          id: "m1",
          group: { name: "Grupo Norte", status: true },
          client: {
            id: "c1",
            status: "Ativo",
            state: "BA",
            segment: " padaria ",
            state_registration: "1",
          },
        },
        {
          id: "m2",
          group: { name: "Grupo Norte", status: true },
          client: {
            id: "c2",
            status: "Ativo",
            state: "BA",
            segment: "Outro",
            state_registration: "2",
          },
        },
      ]);
      const service = new RegularizePortfolioReportingService(
        prismaWith({
          clientsGroup: { findMany: members },
          clientSegment: {
            findMany: vi.fn().mockResolvedValue([{ name: "Padaria ", type: "comercio" }]),
          },
        }),
      );

      await expect(
        service.extract({
          organizationId,
          source: "regularize.client_groups",
          fields: ["group_name", "dte_eligible", "segment_type", "dte_missing_data"],
          limit: 10,
        }),
      ).resolves.toEqual({
        rows: [
          {
            group_name: "Grupo Norte",
            dte_eligible: true,
            segment_type: "comercio",
            dte_missing_data: null,
          },
          // Segmento fora do catálogo: sem tipo, fora da lista e sinalizado.
          {
            group_name: "Grupo Norte",
            dte_eligible: false,
            segment_type: null,
            dte_missing_data: "Segmento fora do catálogo",
          },
        ],
        reachedLimit: false,
      });
      expect(members.mock.calls[0]?.[0].select.client.select).toEqual({
        id: true,
        segment: true,
        status: true,
        state: true,
        state_registration: true,
      });
    });

    it("filtra por UF e fecha a contagem com a lista", async () => {
      const filters = [
        { field: "dte_eligible", operator: "eq", parameter: "dte", value: true },
        { field: "state", operator: "eq", parameter: "uf", value: "BA" },
      ];
      const service = build();

      await expect(
        service.extract({
          organizationId,
          source: "regularize.clients",
          fields: ["name", "state_registration"],
          limit: 20,
          query: { filters },
        }),
      ).resolves.toEqual({
        rows: [
          { name: "Comércio BA", state_registration: "123" },
          { name: "Indústria em inativação", state_registration: "456" },
          { name: "Sem inscrição", state_registration: null },
        ],
        reachedLimit: false,
      });
      await expect(
        service.extract({
          organizationId,
          source: "regularize.clients",
          fields: ["state"],
          limit: 20,
          query: {
            filters: [filters[0] as never],
            group_by: ["state"],
            aggregations: [{ field: "state", function: "count_rows", alias: "total" }],
            order_by: [{ field: "state", direction: "asc" }],
          },
        }),
      ).resolves.toEqual({
        rows: [
          { state: "BA", total: 3 },
          { state: "PE", total: 1 },
          { state: null, total: 1 },
        ],
        reachedLimit: false,
      });
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
