import "./envBootstrap.js";

import { describe, expect, it, vi } from "vitest";

import { InternalReportingService } from "../reporting/internalReportingService.js";

const ORGANIZATION_ID = "a0000000-0000-4000-8000-000000000001";

describe("fiscal internal reporting service", () => {
  it("extrai somente campos publicados, filtra a organização e sinaliza o limite", async () => {
    const ncm = {
      findMany: vi.fn().mockResolvedValue([
        { ncm_code: "84719012", description: "Unidade" },
        { ncm_code: "84713012", description: "Portátil" },
      ]),
    };
    const service = new InternalReportingService({ ncm } as never);

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
    const ncm = { findMany: vi.fn() };
    const service = new InternalReportingService({ ncm } as never);

    await expect(
      service.extract({
        organizationId: ORGANIZATION_ID,
        source: "fiscal.ncm",
        fields: ["id"],
        limit: 1,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(ncm.findMany).not.toHaveBeenCalled();
  });
});
