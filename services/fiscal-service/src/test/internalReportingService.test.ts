import "./envBootstrap.js";

import { describe, expect, it, vi } from "vitest";

import { InternalReportingService } from "../reporting/internalReportingService.js";

const ORGANIZATION_ID = "a0000000-0000-4000-8000-000000000001";

describe("fiscal internal reporting service", () => {
  it("extrai ICMS somente campos publicados, filtra a organização e sinaliza o limite", async () => {
    const icms = {
      findMany: vi.fn().mockResolvedValue([
        { state: "SP", description: "Substituição tributária" },
        { state: "RJ", description: "Operação interna" },
      ]),
    };
    const service = new InternalReportingService({ icms, ncm: { findMany: vi.fn() } } as never);

    await expect(
      service.extract({
        organizationId: ORGANIZATION_ID,
        source: "fiscal.icms",
        fields: ["state", "description"],
        limit: 1,
      }),
    ).resolves.toEqual({
      rows: [{ state: "SP", description: "Substituição tributária" }],
      reachedLimit: true,
    });
    expect(icms.findMany).toHaveBeenCalledWith({
      where: { organization_id: ORGANIZATION_ID },
      select: { state: true, description: true },
      take: 2,
    });
  });

  it("extrai NCM somente campos publicados, filtra a organização e sinaliza o limite", async () => {
    const ncm = {
      findMany: vi.fn().mockResolvedValue([
        { ncm_code: "84719012", description: "Unidade" },
        { ncm_code: "84713012", description: "Portátil" },
      ]),
    };
    const service = new InternalReportingService({ icms: { findMany: vi.fn() }, ncm } as never);

    await expect(
      service.extract({
        organizationId: ORGANIZATION_ID,
        source: "fiscal.ncm",
        fields: ["ncm_code", "description"],
        limit: 1,
      }),
    ).resolves.toEqual({
      rows: [{ ncm_code: "84719012", description: "Unidade" }],
      reachedLimit: true,
    });
    expect(ncm.findMany).toHaveBeenCalledWith({
      where: { organization_id: ORGANIZATION_ID },
      select: { ncm_code: true, description: true },
      take: 2,
    });
  });

  it("recusa ID e campos não publicados sem consultar o banco", async () => {
    const icms = { findMany: vi.fn() };
    const ncm = { findMany: vi.fn() };
    const service = new InternalReportingService({ icms, ncm } as never);

    await expect(
      service.extract({
        organizationId: ORGANIZATION_ID,
        source: "fiscal.icms",
        fields: ["id"],
        limit: 1,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      service.extract({
        organizationId: ORGANIZATION_ID,
        source: "fiscal.ncm",
        fields: ["id"],
        limit: 1,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(icms.findMany).not.toHaveBeenCalled();
    expect(ncm.findMany).not.toHaveBeenCalled();
  });
});
