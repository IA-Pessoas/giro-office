import "./envBootstrap.js";

import { describe, expect, it, vi } from "vitest";

import { RegularizeMunicipalTaxesReportingService } from "../reporting/internalReportingService.js";

describe("RegularizeMunicipalTaxesReportingService", () => {
  it("filtra por organização, limita a origem e projeta apenas campos publicados", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        year: 2026,
        tff_amount: 123.45,
        client_id: "nao-publicar",
        id: "nao-publicar",
      },
      { year: 2025, tff_amount: 100 },
    ]);
    const service = new RegularizeMunicipalTaxesReportingService({ municipalTaxes: { findMany } });

    await expect(
      service.extract({
        organizationId: "10000000-0000-4000-8000-000000000001",
        source: "regularize.municipal_taxes",
        fields: ["year", "tff_amount"],
        limit: 1,
      }),
    ).resolves.toEqual({
      rows: [{ year: 2026, tff_amount: 123.45 }],
      reachedLimit: true,
    });

    expect(findMany).toHaveBeenCalledWith({
      where: { organization_id: "10000000-0000-4000-8000-000000000001" },
      select: { id: true, year: true, tff_amount: true },
      orderBy: { id: "asc" },
      take: 3,
    });
  });

  it("traz cliente, município e inscrição municipal no relatório por ano", async () => {
    const organization_id = "10000000-0000-4000-8000-000000000001";
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "t1",
        year: 2026,
        tff_notes: "Parcelado",
        client: {
          name: "Alfa",
          company_name: "Alfa Ltda",
          city: "Salvador",
          municipal_registration: "123456",
          organization_id,
        },
      },
      {
        id: "t2",
        year: 2026,
        tff_notes: null,
        client: {
          name: "Alheia",
          city: "Recife",
          municipal_registration: "999",
          organization_id: "20000000-0000-4000-8000-000000000002",
        },
      },
    ]);
    const service = new RegularizeMunicipalTaxesReportingService({ municipalTaxes: { findMany } });

    await expect(
      service.extract({
        organizationId: organization_id,
        source: "regularize.municipal_taxes",
        fields: [
          "year",
          "client_name",
          "client_city",
          "client_municipal_registration",
          "tff_notes",
        ],
        limit: 10,
      }),
    ).resolves.toEqual({
      rows: [
        {
          year: 2026,
          client_name: "Alfa Ltda",
          client_city: "Salvador",
          client_municipal_registration: "123456",
          tff_notes: "Parcelado",
        },
        {
          year: 2026,
          client_name: null,
          client_city: null,
          client_municipal_registration: null,
          tff_notes: null,
        },
      ],
      reachedLimit: false,
    });
    expect(findMany.mock.calls[0]?.[0].select).toEqual({
      id: true,
      year: true,
      tff_notes: true,
      client: {
        select: {
          name: true,
          company_name: true,
          city: true,
          municipal_registration: true,
          organization_id: true,
        },
      },
    });
  });

  it("rejeita chaves internas e campos não publicados", async () => {
    const findMany = vi.fn();
    const service = new RegularizeMunicipalTaxesReportingService({ municipalTaxes: { findMany } });

    await expect(
      service.extract({
        organizationId: "10000000-0000-4000-8000-000000000001",
        source: "regularize.municipal_taxes",
        fields: ["client_id"],
        limit: 10,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(findMany).not.toHaveBeenCalled();
  });
});
