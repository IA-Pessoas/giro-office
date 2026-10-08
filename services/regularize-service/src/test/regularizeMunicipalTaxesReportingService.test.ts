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
