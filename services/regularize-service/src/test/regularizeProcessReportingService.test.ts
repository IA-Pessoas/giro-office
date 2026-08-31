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
          status: "Aberto",
          locking_type: "Nenhum",
          urgency: "Alta",
        },
      ],
      reachedLimit: true,
    });

    expect(findMany).toHaveBeenCalledWith({
      where: { organization_id: "10000000-0000-4000-8000-000000000001" },
      select: {
        process_type: true,
        entry_date: true,
        completion_date: true,
        expected_date: true,
        status: true,
        locking_type: true,
        urgency: true,
      },
      take: 2,
    });
  });

  it("rejeita CPF/CNPJ e campos internos antes da consulta", async () => {
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
    expect(findMany).not.toHaveBeenCalled();
  });
});
