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
      select: { has: true, protocol: true },
      take: 2,
    });
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
