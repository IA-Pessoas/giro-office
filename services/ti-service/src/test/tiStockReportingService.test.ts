import "./envBootstrap.js";

import { describe, expect, it, vi } from "vitest";

import { InternalReportingService } from "../reporting/internalReportingService.js";

const organizationId = "10000000-0000-4000-8000-000000000001";

describe("TI stock internal reporting service", () => {
  it("filtra por organização, limita a origem e projeta apenas campos publicados", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        name: "Notebook",
        category: { name: "Hardware" },
        location: { name: "Almoxarifado" },
        quantity: 4,
        description: "Uso interno",
        status: true,
        id: "nao-publicar",
        department_id: "nao-publicar",
        category_id: "nao-publicar",
        location_id: "nao-publicar",
      },
      { name: "Monitor", category: { name: "Hardware" }, location: { name: "Sala 1" } },
    ]);
    const service = new InternalReportingService({ stock: { findMany } });

    await expect(
      service.extract({
        organizationId,
        source: "ti.stock",
        fields: ["name", "category", "location", "quantity", "description", "status"],
        limit: 1,
      }),
    ).resolves.toEqual({
      rows: [
        {
          name: "Notebook",
          category: "Hardware",
          location: "Almoxarifado",
          quantity: 4,
          description: "Uso interno",
          status: true,
        },
      ],
      reachedLimit: true,
    });

    expect(findMany).toHaveBeenCalledWith({
      where: {
        organization_id: organizationId,
        category: { is: { organization_id: organizationId } },
        location: { is: { organization_id: organizationId } },
      },
      select: {
        name: true,
        category: { select: { name: true } },
        location: { select: { name: true } },
        quantity: true,
        description: true,
        status: true,
      },
      take: 2,
    });
  });

  it("rejeita chaves internas e IDs antes da consulta", async () => {
    const findMany = vi.fn();
    const service = new InternalReportingService({ stock: { findMany } });

    for (const field of ["id", "department_id", "category_id", "location_id"]) {
      await expect(
        service.extract({ organizationId, source: "ti.stock", fields: [field], limit: 10 }),
      ).rejects.toMatchObject({ statusCode: 403 });
    }

    expect(findMany).not.toHaveBeenCalled();
  });
});
