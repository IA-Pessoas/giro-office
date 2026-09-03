import { describe, expect, it, vi } from "vitest";

import { TiRequestsReportingService } from "../reporting/tiRequestsReportingService.js";

describe("TiRequestsReportingService", () => {
  it("publica somente os campos e chaves governados dos chamados", () => {
    const service = new TiRequestsReportingService({ tIRequest: {} } as never);

    expect(service.catalog.sources).toEqual([
      expect.objectContaining({
        key: "ti.requests",
        fields: expect.arrayContaining([
          expect.objectContaining({ key: "title" }),
          expect.objectContaining({ key: "category" }),
          expect.objectContaining({ key: "urgency" }),
          expect.objectContaining({ key: "status" }),
          expect.objectContaining({ key: "created_at" }),
          expect.objectContaining({ key: "updated_at" }),
        ]),
        keys: expect.arrayContaining([
          expect.objectContaining({ key: "requester_id" }),
          expect.objectContaining({ key: "assigned_to_id" }),
        ]),
      }),
    ]);

    const fields = service.catalog.sources[0]?.fields.map((field) => field.key) ?? [];
    expect(fields).not.toContain("id");
    expect(fields).not.toContain("organization_id");
    expect(fields).not.toContain("requester_id");
    expect(fields).not.toContain("assigned_to_id");
    expect(fields).not.toContain("description");
    expect(fields).not.toContain("attachment");
  });

  it("filtra por organização, projeta os campos publicados e sinaliza o limite da origem", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "never-returned",
        title: "Notebook sem conexão",
        category: { id: "never-returned", name: "Rede" },
        urgency: "High",
        status: "InProgress",
        created_at: new Date("2026-01-01T00:00:00.000Z"),
        updated_at: new Date("2026-01-02T00:00:00.000Z"),
        requester_id: "never-returned",
        assigned_to_id: "never-returned",
        description: "Conteúdo sensível",
        attachment: "private/path.png",
      },
      { title: "Outro chamado", category: { name: "Hardware" }, urgency: "Low", status: "New" },
    ]);
    const service = new TiRequestsReportingService({ tIRequest: { findMany } } as never);

    await expect(
      service.extract({
        organizationId: "10000000-0000-4000-8000-000000000001",
        source: "ti.requests",
        fields: ["title", "category", "urgency", "status", "created_at", "updated_at"],
        limit: 1,
      }),
    ).resolves.toEqual({
      rows: [
        {
          title: "Notebook sem conexão",
          category: "Rede",
          urgency: "High",
          status: "InProgress",
          created_at: new Date("2026-01-01T00:00:00.000Z"),
          updated_at: new Date("2026-01-02T00:00:00.000Z"),
        },
      ],
      reachedLimit: true,
    });

    expect(findMany).toHaveBeenCalledWith({
      where: { organization_id: "10000000-0000-4000-8000-000000000001" },
      select: {
        title: true,
        category: { select: { name: true } },
        urgency: true,
        status: true,
        created_at: true,
        updated_at: true,
      },
      take: 2,
    });
  });

  it("recusa projeções fora do catálogo antes de consultar o banco", async () => {
    const findMany = vi.fn();
    const service = new TiRequestsReportingService({ tIRequest: { findMany } } as never);

    await expect(
      service.extract({
        organizationId: "10000000-0000-4000-8000-000000000001",
        source: "ti.requests",
        fields: ["description"],
        limit: 1,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(findMany).not.toHaveBeenCalled();
  });
});
