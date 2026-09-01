import { describe, expect, it, vi } from "vitest";

import { TiInventoryReportingService } from "../reporting/tiInventoryReportingService.js";

describe("TiInventoryReportingService", () => {
  it("publica somente os campos e chaves governados do inventário", () => {
    const service = new TiInventoryReportingService({ inventoryTecnologia: {} } as never);

    expect(service.catalog.sources).toEqual([
      expect.objectContaining({
        key: "ti.inventory",
        fields: expect.arrayContaining([
          expect.objectContaining({ key: "asset_code" }),
          expect.objectContaining({ key: "category" }),
          expect.objectContaining({ key: "location" }),
          expect.objectContaining({ key: "delivery_date" }),
          expect.objectContaining({ key: "return_date" }),
          expect.objectContaining({ key: "notes" }),
        ]),
        keys: expect.arrayContaining([
          expect.objectContaining({ key: "user_id" }),
          expect.objectContaining({ key: "location_id" }),
          expect.objectContaining({ key: "category_id" }),
          expect.objectContaining({ key: "responsible_it_staff_id" }),
        ]),
      }),
    ]);

    const fields = service.catalog.sources[0]?.fields.map((field) => field.key) ?? [];
    expect(fields).not.toContain("id");
    expect(fields).not.toContain("organization_id");
    expect(fields).not.toContain("user_id");
    expect(fields).not.toContain("responsible_it_staff_id");
  });

  it("filtra por organização, projeta os campos publicados e sinaliza o limite da origem", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "never-returned",
        asset_code: "NB-001",
        category: { id: "never-returned", name: "Notebook" },
        location: { id: "never-returned", name: "Matriz" },
        notes: "Uso administrativo",
      },
      {
        asset_code: "NB-002",
        category: { name: "Notebook" },
        location: null,
        notes: null,
      },
    ]);
    const service = new TiInventoryReportingService({ inventoryTecnologia: { findMany } } as never);

    await expect(
      service.extract({
        organizationId: "10000000-0000-4000-8000-000000000001",
        source: "ti.inventory",
        fields: ["asset_code", "category", "location", "notes"],
        limit: 1,
      }),
    ).resolves.toEqual({
      rows: [
        {
          asset_code: "NB-001",
          category: "Notebook",
          location: "Matriz",
          notes: "Uso administrativo",
        },
      ],
      reachedLimit: true,
    });

    expect(findMany).toHaveBeenCalledWith({
      where: { organization_id: "10000000-0000-4000-8000-000000000001" },
      select: {
        asset_code: true,
        category: { select: { name: true } },
        location: { select: { name: true } },
        notes: true,
      },
      take: 2,
    });
  });

  it("recusa projeções fora do catálogo antes de consultar o banco", async () => {
    const findMany = vi.fn();
    const service = new TiInventoryReportingService({ inventoryTecnologia: { findMany } } as never);

    await expect(
      service.extract({
        organizationId: "10000000-0000-4000-8000-000000000001",
        source: "ti.inventory",
        fields: ["id"],
        limit: 1,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(findMany).not.toHaveBeenCalled();
  });
});
