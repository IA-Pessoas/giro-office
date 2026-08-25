import "./envBootstrap.js";

import { describe, expect, it, vi } from "vitest";

import { InternalReportingService } from "../services/internalReportingService.js";

const ORG_A = "00000000-0000-4000-8000-000000000001";

describe("InternalReportingService", () => {
  it("extrai somente campos publicados na organização do grant e identifica corte", async () => {
    const controls = {
      findMany: vi.fn().mockResolvedValue([
        { competence: "2026-01", monthly_closing: true },
        { competence: "2026-02", monthly_closing: false },
        { competence: "2026-03", monthly_closing: true },
      ]),
    };
    const service = new InternalReportingService({ controlContabil: controls } as never);

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
    expect(controls.findMany).toHaveBeenCalledWith({
      where: { organization_id: ORG_A },
      select: { competence: true, monthly_closing: true },
      take: 3,
    });
  });

  it("recusa chaves e texto sensível que não são campos de relatório", async () => {
    const controls = { findMany: vi.fn() };
    const service = new InternalReportingService({ controlContabil: controls } as never);

    for (const field of ["client_id", "id", "notes"]) {
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
});
