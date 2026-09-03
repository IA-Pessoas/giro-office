import { describe, expect, it, vi } from "vitest";

import { TiExtensionsReportingService } from "../reporting/tiExtensionsReportingService.js";

describe("TiExtensionsReportingService", () => {
  it("publica apenas ramal e datas, mantém usuário como chave interna e limita a extração ao tenant", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "never-returned",
        user_id: "never-returned",
        number: "1234",
        createdAt: new Date("2026-08-01T10:00:00.000Z"),
        updatedAt: new Date("2026-08-02T10:00:00.000Z"),
      },
      {
        number: "5678",
        createdAt: new Date("2026-08-03T10:00:00.000Z"),
        updatedAt: new Date("2026-08-04T10:00:00.000Z"),
      },
    ]);
    const service = new TiExtensionsReportingService({
      extensionsTecnologia: { findMany },
    } as never);

    expect(service.catalog.sources).toEqual([
      expect.objectContaining({
        key: "ti.extensions",
        fields: expect.arrayContaining([
          expect.objectContaining({ key: "number" }),
          expect.objectContaining({ key: "created_at" }),
          expect.objectContaining({ key: "updated_at" }),
        ]),
        keys: [expect.objectContaining({ key: "user_id" })],
      }),
    ]);
    expect(service.catalog.sources[0]?.fields.map((field) => field.key)).not.toContain("id");

    await expect(
      service.extract({
        organizationId: "10000000-0000-4000-8000-000000000001",
        source: "ti.extensions",
        fields: ["number", "created_at", "updated_at"],
        limit: 1,
      }),
    ).resolves.toEqual({
      rows: [
        {
          number: "1234",
          created_at: new Date("2026-08-01T10:00:00.000Z"),
          updated_at: new Date("2026-08-02T10:00:00.000Z"),
        },
      ],
      reachedLimit: true,
    });

    expect(findMany).toHaveBeenCalledWith({
      where: { organization_id: "10000000-0000-4000-8000-000000000001" },
      select: { number: true, createdAt: true, updatedAt: true },
      take: 2,
    });
  });

  it("recusa campo não publicado antes de consultar a origem", async () => {
    const findMany = vi.fn();
    const service = new TiExtensionsReportingService({
      extensionsTecnologia: { findMany },
    } as never);

    await expect(
      service.extract({
        organizationId: "10000000-0000-4000-8000-000000000001",
        source: "ti.extensions",
        fields: ["user_id"],
        limit: 1,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(findMany).not.toHaveBeenCalled();
  });
});
