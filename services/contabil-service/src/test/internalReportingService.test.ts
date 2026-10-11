import "./envBootstrap.js";

import { describe, expect, it, vi } from "vitest";

import { InternalReportingService } from "../services/internalReportingService.js";

const ORG_A = "00000000-0000-4000-8000-000000000001";

describe("InternalReportingService", () => {
  it("extrai somente campos publicados na organização do grant e identifica corte", async () => {
    const controls = {
      findMany: vi.fn().mockResolvedValue([
        { id: "1", client_id: "a", competence: "2026-01", monthly_closing: true },
        { id: "2", client_id: "a", competence: "2026-02", monthly_closing: false },
        { id: "3", client_id: "a", competence: "2026-03", monthly_closing: true },
      ]),
    };
    const client = { findMany: vi.fn() };
    const service = new InternalReportingService({ controlContabil: controls, client } as never);

    await expect(
      service.extract({
        organizationId: ORG_A,
        source: "contabil.control",
        fields: ["competence", "monthly_closing"],
        limit: 2,
      }),
    ).resolves.toEqual({
      rows: [
        { competence: "2026-01", monthly_closing: true },
        { competence: "2026-02", monthly_closing: false },
      ],
      reachedLimit: true,
    });
    // Só o controle vigente: o arquivado fica no histórico.
    expect(controls.findMany).toHaveBeenCalledWith({
      where: { organization_id: ORG_A, archived_at: null },
      select: { id: true, client_id: true, competence: true, monthly_closing: true },
      orderBy: { id: "asc" },
      skip: 0,
      take: 3,
    });
    // Sem campo de cliente pedido, a tabela de clientes não é lida.
    expect(client.findMany).not.toHaveBeenCalled();
  });

  it("recusa chaves e colunas internas que não são campos de relatório", async () => {
    const controls = { findMany: vi.fn() };
    const service = new InternalReportingService({ controlContabil: controls } as never);

    for (const field of ["client_id", "id", "organization_id", "archived_at"]) {
      await expect(
        service.extract({
          organizationId: ORG_A,
          source: "contabil.control",
          fields: [field],
          limit: 1,
        }),
      ).rejects.toMatchObject({ statusCode: 403 });
    }
    expect(controls.findMany).not.toHaveBeenCalled();
  });

  it("extrai relacionamento contábil com escopo da organização e limite", async () => {
    const relationships = {
      findMany: vi.fn().mockResolvedValue([
        {
          id: "1",
          client_id: "a",
          bidding: true,
          chart_accounts: "Plano A",
          tool: "Ferramenta A",
          system: "Sistema A",
        },
        {
          id: "2",
          client_id: "b",
          bidding: false,
          chart_accounts: "Plano B",
          tool: "Ferramenta B",
          system: "Sistema B",
        },
      ]),
    };
    const client = { findMany: vi.fn() };
    const service = new InternalReportingService({
      relationshipContabil: relationships,
      client,
    } as never);

    await expect(
      service.extract({
        organizationId: ORG_A,
        source: "contabil.relationship",
        fields: ["bidding", "chart_accounts", "tool", "system"],
        limit: 1,
      }),
    ).resolves.toEqual({
      rows: [
        { bidding: true, chart_accounts: "Plano A", tool: "Ferramenta A", system: "Sistema A" },
      ],
      reachedLimit: true,
    });
    expect(relationships.findMany).toHaveBeenCalledWith({
      where: { organization_id: ORG_A },
      select: {
        id: true,
        client_id: true,
        bidding: true,
        tool: true,
        system: true,
        chart_accounts: true,
      },
      orderBy: { id: "asc" },
      skip: 0,
      take: 2,
    });
    // Sem campo de cliente pedido, a tabela de clientes não é lida.
    expect(client.findMany).not.toHaveBeenCalled();
  });

  it("extrai o indicador de movimento de responsáveis com escopo da organização", async () => {
    const client = { findMany: vi.fn().mockResolvedValue([{ id: "a" }, { id: "b" }]) };
    const responsible = {
      findMany: vi.fn().mockResolvedValue([{ client_id: "a", customer_with_movement: true }]),
    };
    const user = { findMany: vi.fn() };
    const service = new InternalReportingService({
      client,
      responsibleContabil: responsible,
      user,
    } as never);

    await expect(
      service.extract({
        organizationId: ORG_A,
        source: "contabil.responsibles",
        fields: ["customer_with_movement"],
        limit: 1,
      }),
    ).resolves.toEqual({
      rows: [{ customer_with_movement: true }],
      reachedLimit: true,
    });
    expect(client.findMany).toHaveBeenCalledWith({
      where: { organization_id: ORG_A, contabil: true },
      select: { id: true },
      orderBy: { id: "asc" },
      skip: 0,
      take: 2,
    });
    expect(responsible.findMany).toHaveBeenCalledWith({
      where: { organization_id: ORG_A, client_id: { in: ["a"] } },
      select: { client_id: true, customer_with_movement: true },
      orderBy: { id: "asc" },
    });
    // Sem nome de responsável pedido, a tabela de usuários não é lida.
    expect(user.findMany).not.toHaveBeenCalled();
  });

  it("não publica ids nem organização do relacionamento", async () => {
    const relationships = { findMany: vi.fn() };
    const service = new InternalReportingService({ relationshipContabil: relationships } as never);

    for (const field of ["client_id", "id", "organization_id"]) {
      await expect(
        service.extract({
          organizationId: ORG_A,
          source: "contabil.relationship",
          fields: [field],
          limit: 1,
        }),
      ).rejects.toMatchObject({ statusCode: 403 });
    }
    expect(relationships.findMany).not.toHaveBeenCalled();
  });

  it("não publica ids ou conteúdo sensível de responsáveis", async () => {
    const responsible = { findMany: vi.fn() };
    const service = new InternalReportingService({ responsibleContabil: responsible } as never);

    for (const field of ["client_id", "person_responsible_id", "posted_by_id", "id"]) {
      await expect(
        service.extract({
          organizationId: ORG_A,
          source: "contabil.responsibles",
          fields: [field],
          limit: 1,
        }),
      ).rejects.toMatchObject({ statusCode: 403 });
    }
    expect(responsible.findMany).not.toHaveBeenCalled();
  });
});
