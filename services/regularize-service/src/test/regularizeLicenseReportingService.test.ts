import "./envBootstrap.js";

import { describe, expect, it, vi } from "vitest";

import { RegularizeLicenseReportingService } from "../reporting/internalReportingService.js";

describe("RegularizeLicenseReportingService", () => {
  it("filtra por organização, limita a origem e projeta apenas campos publicados", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        has: true,
        protocol: "P-1",
        id: "nao-publicar",
        client_id: "nao-publicar",
      },
      { has: false, protocol: "P-2" },
    ]);
    const service = new RegularizeLicenseReportingService({ license: { findMany } });

    await expect(
      service.extract({
        organizationId: "10000000-0000-4000-8000-000000000001",
        source: "regularize.licenses",
        fields: ["has", "protocol"],
        limit: 1,
      }),
    ).resolves.toEqual({
      rows: [{ has: true, protocol: "P-1" }],
      reachedLimit: true,
    });

    expect(findMany).toHaveBeenCalledWith({
      where: { organization_id: "10000000-0000-4000-8000-000000000001" },
      select: { id: true, has: true, protocol: true },
      orderBy: { id: "asc" },
      take: 3,
    });
  });

  it("monta o relatório de alvarás com cliente, responsável, mês e travamento", async () => {
    const organization_id = "10000000-0000-4000-8000-000000000001";
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "l1",
        type_license: "Sanitário",
        status: "Ativo",
        observation: "Aguardando vistoria",
        type: "3",
        entry_date: new Date("2026-04-02T00:00:00.000Z"),
        client: { name: "Alfa", company_name: "Alfa Ltda", organization_id },
        responsible: { name: "Bruna", organization_id },
      },
      {
        id: "l2",
        type_license: "Bombeiros",
        status: "Finalizado",
        observation: null,
        type: "Anual",
        entry_date: new Date("2026-05-20T00:00:00.000Z"),
        client: { name: "Alheia", organization_id: "20000000-0000-4000-8000-000000000002" },
        responsible: null,
      },
    ]);
    const service = new RegularizeLicenseReportingService({ license: { findMany } });

    await expect(
      service.extract({
        organizationId: organization_id,
        source: "regularize.licenses",
        fields: [
          "client_name",
          "type_license",
          "status",
          "observation",
          "responsible_name",
          "entry_month",
          "locking_type",
          "locked",
        ],
        limit: 10,
      }),
    ).resolves.toEqual({
      rows: [
        {
          client_name: "Alfa Ltda",
          type_license: "Sanitário",
          status: "Em Andamento",
          observation: "Aguardando vistoria",
          responsible_name: "Bruna",
          entry_month: "2026-04",
          locking_type: "Órgão público",
          locked: true,
        },
        {
          client_name: null,
          type_license: "Bombeiros",
          status: "Finalizado",
          observation: null,
          responsible_name: null,
          entry_month: "2026-05",
          locking_type: null,
          locked: false,
        },
      ],
      reachedLimit: false,
    });
    const related = { select: { name: true, organization_id: true } };
    expect(findMany.mock.calls[0]?.[0].select).toEqual({
      id: true,
      type_license: true,
      status: true,
      observation: true,
      entry_date: true,
      type: true,
      client: { select: { name: true, company_name: true, organization_id: true } },
      responsible: related,
    });
  });

  it("filtro salvo com o status legado Ativo fecha com Em Andamento na lista e no total", async () => {
    const licenses = [
      { id: "l1", type_license: "Sanitário", status: "Ativo" },
      { id: "l2", type_license: "Bombeiros", status: "Em Andamento" },
      { id: "l3", type_license: "Ambiental", status: "Paralisado" },
    ];
    const prisma: Record<string, unknown> = { license: { findMany: vi.fn(async () => licenses) } };
    prisma.$transaction = async (read: (transaction: unknown) => unknown) => read(prisma);
    const service = new RegularizeLicenseReportingService(prisma as never);
    const extract = (value: string, aggregations?: unknown) =>
      service.extract({
        organizationId: "10000000-0000-4000-8000-000000000001",
        source: "regularize.licenses",
        fields: ["type_license"],
        limit: 10,
        query: {
          filters: [{ field: "status", operator: "eq", parameter: "status", value }],
          ...(aggregations ? { aggregations } : {}),
        } as never,
      });

    for (const value of ["Ativo", "Em Andamento"]) {
      await expect(extract(value)).resolves.toEqual({
        rows: [{ type_license: "Sanitário" }, { type_license: "Bombeiros" }],
        reachedLimit: false,
      });
      await expect(
        extract(value, [{ field: "type_license", function: "count", alias: "total" }]),
      ).resolves.toEqual({ rows: [{ total: 2 }], reachedLimit: false });
    }
  });

  it("rejeita chaves internas e campos não publicados", async () => {
    const findMany = vi.fn();
    const service = new RegularizeLicenseReportingService({ license: { findMany } });

    await expect(
      service.extract({
        organizationId: "10000000-0000-4000-8000-000000000001",
        source: "regularize.licenses",
        fields: ["id"],
        limit: 10,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(findMany).not.toHaveBeenCalled();
  });
});
