import "./envBootstrap.js";

import { describe, expect, it, vi } from "vitest";

import { RegularizeLicenseReportingService } from "../reporting/internalReportingService.js";

describe("Regularize process reporting service", () => {
  it("filtra por organização, seleciona campos aprovados e sinaliza limite", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        process_type: "Abertura",
        entry_date: new Date("2026-01-01T00:00:00.000Z"),
        completion_date: null,
        expected_date: new Date("2026-02-01T00:00:00.000Z"),
        status: "Aberto",
        locking_type: "Nenhum",
        urgency: "Alta",
        id: "nao-publicar",
        cpf_cnpj: "nao-publicar",
        description: "nao-publicar",
        observation: "nao-publicar",
        client_pf_id: "client-pf-1",
      },
      { process_type: "Baixa", status: "Concluído" },
    ]);
    const service = new RegularizeLicenseReportingService({
      license: { findMany: vi.fn() },
      process: { findMany },
    });

    await expect(
      service.extract({
        organizationId: "10000000-0000-4000-8000-000000000001",
        source: "regularize.processes",
        fields: [
          "process_type",
          "entry_date",
          "completion_date",
          "expected_date",
          "status",
          "locking_type",
          "urgency",
        ],
        limit: 1,
      }),
    ).resolves.toEqual({
      rows: [
        {
          process_type: "Abertura",
          entry_date: new Date("2026-01-01T00:00:00.000Z"),
          completion_date: null,
          expected_date: new Date("2026-02-01T00:00:00.000Z"),
          status: "Andamento",
          locking_type: "Nenhum",
          urgency: "Alta",
        },
      ],
      reachedLimit: true,
    });

    expect(findMany).toHaveBeenCalledWith({
      where: {
        organization_id: "10000000-0000-4000-8000-000000000001",
        process_type: { not: "Processo técnico para orientação legada" },
      },
      select: {
        id: true,
        process_type: true,
        entry_date: true,
        completion_date: true,
        expected_date: true,
        status: true,
        locking_type: true,
        urgency: true,
      },
      orderBy: { id: "asc" },
      take: 3,
    });
  });

  it("monta o relatório de travamentos com cliente, responsável e mês", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "p1",
        description: "Aguardando documento do cliente",
        status: "Aberto",
        locking_type: "Cliente",
        entry_date: new Date("2026-03-10T00:00:00.000Z"),
        clientPJ: { name: "Alfa", company_name: "Alfa Ltda" },
        clientPF: null,
        responsible1: { name: "Bruna" },
      },
      {
        id: "p2",
        description: "",
        status: "Protocolado",
        locking_type: "  ",
        entry_date: null,
        clientPJ: null,
        clientPF: { name: "Caio" },
        responsible1: null,
      },
    ]);
    const service = new RegularizeLicenseReportingService({
      license: { findMany: vi.fn() },
      process: { findMany },
    });

    await expect(
      service.extract({
        organizationId: "10000000-0000-4000-8000-000000000001",
        source: "regularize.processes",
        fields: [
          "client_name",
          "description",
          "status",
          "locking_type",
          "locked",
          "entry_month",
          "responsible1_name",
        ],
        limit: 10,
      }),
    ).resolves.toEqual({
      rows: [
        {
          client_name: "Alfa Ltda",
          description: "Aguardando documento do cliente",
          status: "Andamento",
          locking_type: "Cliente",
          locked: true,
          entry_month: "2026-03",
          responsible1_name: "Bruna",
        },
        {
          client_name: "Caio",
          description: "",
          status: "Protocolado",
          locking_type: null,
          locked: false,
          entry_month: null,
          responsible1_name: null,
        },
      ],
      reachedLimit: false,
    });
    expect(findMany.mock.calls[0]?.[0].select).toEqual({
      id: true,
      description: true,
      status: true,
      locking_type: true,
      entry_date: true,
      clientPJ: { select: { name: true, company_name: true } },
      clientPF: { select: { name: true } },
      responsible1: { select: { name: true } },
    });
  });

  it("a variante pendente/em andamento/protocolado fecha lista e total", async () => {
    const processes = [
      { id: "p1", process_type: "Abertura", status: "Pendente", locking_type: "Cliente" },
      { id: "p2", process_type: "Baixa", status: "Em andamento", locking_type: null },
      { id: "p3", process_type: "Alteração", status: "Protocolado", locking_type: "Diretoria" },
      { id: "p4", process_type: "Abertura", status: "Concluído", locking_type: "Cliente" },
      { id: "p5", process_type: "Baixa", status: "Paralizado", locking_type: null },
    ];
    const prisma: Record<string, unknown> = {
      license: { findMany: vi.fn() },
      process: { findMany: vi.fn(async () => processes) },
    };
    prisma.$transaction = async (read: (transaction: unknown) => unknown) => read(prisma);
    const service = new RegularizeLicenseReportingService(prisma as never);
    const variant = {
      field: "status",
      operator: "in",
      parameter: "variante",
      value: ["Pendente", "Andamento", "Protocolado"],
    };
    const extract = (query: Record<string, unknown>) =>
      service.extract({
        organizationId: "10000000-0000-4000-8000-000000000001",
        source: "regularize.processes",
        fields: ["process_type"],
        limit: 10,
        query: query as never,
      });

    await expect(extract({ filters: [variant] })).resolves.toEqual({
      rows: [
        { process_type: "Abertura" },
        { process_type: "Baixa" },
        { process_type: "Alteração" },
      ],
      reachedLimit: false,
    });
    await expect(
      extract({
        filters: [variant],
        aggregations: [{ field: "process_type", function: "count", alias: "total" }],
      }),
    ).resolves.toEqual({ rows: [{ total: 3 }], reachedLimit: false });
    // Travados dentro da variante: só os que têm motivo de travamento.
    await expect(
      extract({
        filters: [variant, { field: "locked", operator: "eq", parameter: "travado", value: true }],
        aggregations: [{ field: "process_type", function: "count", alias: "total" }],
      }),
    ).resolves.toEqual({ rows: [{ total: 2 }], reachedLimit: false });
  });

  it("rejeita CPF/CNPJ e chaves internas antes da consulta", async () => {
    const findMany = vi.fn();
    const service = new RegularizeLicenseReportingService({
      license: { findMany: vi.fn() },
      process: { findMany },
    });

    await expect(
      service.extract({
        organizationId: "10000000-0000-4000-8000-000000000001",
        source: "regularize.processes",
        fields: ["cpf_cnpj"],
        limit: 10,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      service.extract({
        organizationId: "10000000-0000-4000-8000-000000000001",
        source: "regularize.processes",
        fields: ["client_pj_id"],
        limit: 10,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(findMany).not.toHaveBeenCalled();
  });
});
