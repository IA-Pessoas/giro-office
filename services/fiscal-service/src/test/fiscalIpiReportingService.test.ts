import "./envBootstrap.js";

import { describe, expect, it, vi } from "vitest";

import { InternalReportingService } from "../reporting/internalReportingService.js";

const ORGANIZATION_ID = "a0000000-0000-4000-8000-000000000001";

describe("fiscal IPI internal reporting service", () => {
  it("extrai IPI somente campos publicados, filtra a organização e sinaliza o limite", async () => {
    const ipi = {
      findMany: vi.fn().mockResolvedValue([
        { ncm: "84719012", ex: "01", description: "Equipamento", aliquot: "5.00" },
        { ncm: "84713012", ex: null, description: "Portátil", aliquot: "10.00" },
      ]),
    };
    const service = new InternalReportingService({
      icms: { findMany: vi.fn() },
      ncm: { findMany: vi.fn() },
      ipi,
    } as never);

    await expect(
      service.extract({
        organizationId: ORGANIZATION_ID,
        source: "fiscal.ipi",
        fields: ["ncm", "ex", "description", "aliquot"],
        limit: 1,
      }),
    ).resolves.toEqual({
      rows: [{ ncm: "84719012", ex: "01", description: "Equipamento", aliquot: "5.00" }],
      reachedLimit: true,
    });
    expect(ipi.findMany).toHaveBeenCalledWith({
      where: { organization_id: ORGANIZATION_ID },
      select: { ncm: true, ex: true, description: true, aliquot: true },
      take: 2,
    });
  });

  it("recusa ID e campos não publicados de IPI sem consultar o banco", async () => {
    const ipi = { findMany: vi.fn() };
    const service = new InternalReportingService({
      icms: { findMany: vi.fn() },
      ncm: { findMany: vi.fn() },
      ipi,
    } as never);

    await expect(
      service.extract({
        organizationId: ORGANIZATION_ID,
        source: "fiscal.ipi",
        fields: ["id"],
        limit: 1,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(ipi.findMany).not.toHaveBeenCalled();
  });
});
