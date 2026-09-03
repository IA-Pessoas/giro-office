import { describe, expect, it, vi } from "vitest";

import { InternalReportingService } from "../reporting/internalReportingService.js";

describe("InternalReportingService para feriados", () => {
  it("filtra feriados pela organização e projeta somente nome e data", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        name: "Feriado municipal",
        date: new Date("2026-09-07T00:00:00.000Z"),
        id: "nao-publicar",
        organization_id: "nao-publicar",
      },
      { name: "Segundo feriado", date: new Date("2026-10-12T00:00:00.000Z") },
    ]);
    const service = new InternalReportingService({ holidays: { findMany } } as never);

    await expect(
      service.extract({
        organizationId: "10000000-0000-4000-8000-000000000001",
        source: "rh.holidays",
        fields: ["name", "date"],
        limit: 1,
      }),
    ).resolves.toEqual({
      rows: [{ name: "Feriado municipal", date: new Date("2026-09-07T00:00:00.000Z") }],
      reachedLimit: true,
    });

    expect(findMany).toHaveBeenCalledWith({
      where: { organization_id: "10000000-0000-4000-8000-000000000001" },
      select: { name: true, date: true },
      take: 2,
    });
  });

  it("rejeita IDs e campos não publicados antes de consultar feriados", async () => {
    const findMany = vi.fn();
    const service = new InternalReportingService({ holidays: { findMany } } as never);

    for (const field of ["id", "organization_id"]) {
      await expect(
        service.extract({
          organizationId: "10000000-0000-4000-8000-000000000001",
          source: "rh.holidays",
          fields: [field],
          limit: 10,
        }),
      ).rejects.toMatchObject({ statusCode: 403 });
    }

    expect(findMany).not.toHaveBeenCalled();
  });
});
