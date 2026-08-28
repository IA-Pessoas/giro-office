import "./envBootstrap.js";

import { describe, expect, it, vi } from "vitest";

import { InternalReportingService } from "../services/internalReportingService.js";

const organizationId = "10000000-0000-4000-8000-000000000001";

describe("InternalReportingService", () => {
  it("filtra por organização, projeta campos publicados e informa limite", async () => {
    const findMany = vi.fn().mockResolvedValue([
      { name: "Empresa 1", was_paid: true },
      { name: "Empresa 2", was_paid: false },
      { name: "Empresa 3", was_paid: true },
    ]);
    const service = new InternalReportingService({
      certificatePJ: { findMany },
    } as never);

    await expect(
      service.extract({
        organizationId,
        source: "certificado.pj",
        fields: ["name", "was_paid"],
        limit: 2,
      }),
    ).resolves.toEqual({
      rows: [
        { name: "Empresa 1", was_paid: true },
        { name: "Empresa 2", was_paid: false },
      ],
      reachedLimit: true,
    });

    expect(findMany).toHaveBeenCalledWith({
      where: { organization_id: organizationId },
      select: { name: true, was_paid: true },
      take: 3,
    });
  });

  it("rejeita projeção não publicada sem consultar o banco", async () => {
    const findMany = vi.fn();
    const service = new InternalReportingService({ certificatePJ: { findMany } } as never);

    await expect(
      service.extract({
        organizationId,
        source: "certificado.pj",
        fields: ["id"],
        limit: 10,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(findMany).not.toHaveBeenCalled();
  });
});
