import { describe, expect, it, vi } from "vitest";

import { InternalReportingService } from "../reporting/internalReportingService.js";

describe("InternalReportingService", () => {
  it("filtra por organização, limita a origem e projeta apenas campos publicados", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        title: "Férias",
        category: { name: "Benefícios" },
        urgency: "High",
        status: "New",
        created_at: new Date("2026-08-01T10:00:00.000Z"),
        updated_at: new Date("2026-08-02T10:00:00.000Z"),
        id: "nao-publicar",
        requester_user_id: "nao-publicar",
      },
      { title: "Outro pedido", category: { name: "Folha" } },
    ]);
    const service = new InternalReportingService({ rhRequest: { findMany } });

    await expect(
      service.extract({
        organizationId: "10000000-0000-4000-8000-000000000001",
        source: "rh.requests",
        fields: ["title", "category", "urgency", "status", "created_at", "updated_at"],
        limit: 1,
      }),
    ).resolves.toEqual({
      rows: [
        {
          title: "Férias",
          category: "Benefícios",
          urgency: "High",
          status: "New",
          created_at: new Date("2026-08-01T10:00:00.000Z"),
          updated_at: new Date("2026-08-02T10:00:00.000Z"),
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

  it("rejeita IDs, chaves internas e campos não publicados antes da consulta", async () => {
    const findMany = vi.fn();
    const service = new InternalReportingService({ rhRequest: { findMany } });

    for (const field of ["id", "requester_user_id", "assigned_to_user_id", "category_id"]) {
      await expect(
        service.extract({
          organizationId: "10000000-0000-4000-8000-000000000001",
          source: "rh.requests",
          fields: [field],
          limit: 10,
        }),
      ).rejects.toMatchObject({ statusCode: 403 });
    }

    expect(findMany).not.toHaveBeenCalled();
  });
});
