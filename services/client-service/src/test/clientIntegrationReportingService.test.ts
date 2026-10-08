import { describe, expect, it, vi } from "vitest";

import { ClientIntegrationReportingService } from "../services/clientIntegrationReportingService.js";

const organizationId = "00000000-0000-4000-8000-000000000002";

describe("ClientIntegrationReportingService", () => {
  it("exports persisted client group memberships as report rows scoped to the organization", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        client_id: "client-1",
        group_id: "group-1",
        client: { name: "Cliente A" },
        group: { name: "Holding A" },
      },
    ]);
    const service = new ClientIntegrationReportingService({ clientsGroup: { findMany } } as never);

    await expect(
      service.extract({
        organizationId,
        source: "integracao.client_groups" as never,
        fields: ["client_id", "group_id", "group_name", "name"],
        limit: 10,
      }),
    ).resolves.toEqual({
      rows: [
        { client_id: "client-1", group_id: "group-1", group_name: "Holding A", name: "Cliente A" },
      ],
      reachedLimit: false,
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organization_id: organizationId,
          group: { is: { organization_id: organizationId } },
          client: { is: { organization_id: organizationId } },
        },
        take: 11,
        select: expect.objectContaining({ group: { select: { name: true } } }),
      }),
    );
  });

  it("filters and aggregates report rows by group", async () => {
    const memberships = [
      {
        client_id: "client-1",
        group_id: "group-1",
        client: {},
        group: { name: "Grupo A" },
      },
      {
        client_id: "client-2",
        group_id: "group-1",
        client: {},
        group: { name: "Grupo A" },
      },
      {
        client_id: "client-3",
        group_id: "group-2",
        client: {},
        group: { name: "Grupo B" },
      },
    ];
    const service = new ClientIntegrationReportingService({
      $transaction: async function (read: (transaction: unknown) => Promise<unknown>) {
        return read(this);
      },
      clientsGroup: { findMany: vi.fn().mockResolvedValue(memberships) },
    } as never);

    await expect(
      service.extract({
        organizationId,
        source: "integracao.client_groups" as never,
        fields: ["group_name"],
        limit: 10,
        query: {
          filters: [{ field: "group_name", operator: "eq", parameter: "group", value: "Grupo A" }],
          group_by: ["group_name"],
          aggregations: [{ field: "client_id", function: "count", alias: "clients" }],
        },
      }),
    ).resolves.toMatchObject({
      rows: [{ group_name: "Grupo A", clients: 2 }],
      reachedLimit: false,
    });
  });

  it("consulta somente a organização do grant, sem filtrar dominio_code", async () => {
    const findMany = vi.fn().mockResolvedValue([{ name: "Cliente seguro", status: "Ativo" }]);
    const service = new ClientIntegrationReportingService({ client: { findMany } } as never);

    await expect(
      service.extract({
        organizationId,
        source: "integracao.clients",
        fields: ["name", "status"],
        limit: 10,
      }),
    ).resolves.toEqual({
      rows: [{ name: "Cliente seguro", status: "Ativo" }],
      reachedLimit: false,
    });

    expect(findMany).toHaveBeenCalledWith({
      where: { organization_id: organizationId },
      select: { name: true, status: true },
      take: 11,
    });
  });

  // #1361: CPF/CNPJ passou a ser publicado por decisão de produto.
  it("publica CPF/CNPJ como campo do relatório de clientes", async () => {
    const findMany = vi.fn().mockResolvedValue([{ cpf_cnpj: "11144477735" }]);
    const service = new ClientIntegrationReportingService({ client: { findMany } } as never);

    await service.extract({
      organizationId,
      source: "integracao.clients",
      fields: ["cpf_cnpj"],
      limit: 10,
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ select: expect.objectContaining({ cpf_cnpj: true }) }),
    );
  });

  it("processa query pelo callback e preserva reachedLimit do resultado", async () => {
    const records = Array.from({ length: 150 }, (_, index) => ({
      name: `Cliente ${String(index).padStart(3, "0")}`,
    }));
    const service = new ClientIntegrationReportingService({
      $transaction: async function (read: (transaction: unknown) => Promise<unknown>) {
        return read(this);
      },
      client: {
        findMany: async ({ take, skip = 0 }: { take: number; skip?: number }) =>
          records.slice(skip, skip + take),
      },
    } as never);

    await expect(
      service.extract({
        organizationId,
        source: "integracao.clients",
        fields: ["name"],
        limit: 1,
        query: { order_by: [{ field: "name", direction: "desc" }] },
      }),
    ).resolves.toEqual({
      rows: [{ name: "Cliente 149" }],
      reachedLimit: true,
    });
  });
});
