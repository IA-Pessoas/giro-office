import "./envBootstrap.js";

import { describe, expect, it, vi } from "vitest";

import { InternalReportingService } from "../services/internalReportingService.js";

const ORG_A = "00000000-0000-4000-8000-000000000001";
const ORG_B = "00000000-0000-4000-8000-000000000002";

describe("InternalReportingService", () => {
  it("aplica critérios ao conjunto da organização antes do limite", async () => {
    const records = Array.from({ length: 150 }, (_, index) => ({
      organization_id: ORG_A,
      name: `Projeto ${index}`,
    }));
    records.push({ organization_id: ORG_B, name: "Projeto 149" });
    const service = new InternalReportingService({
      $transaction: async function (read: (transaction: unknown) => Promise<unknown>) {
        return read(this);
      },
      project: {
        findMany: async ({
          where,
          take,
          skip = 0,
        }: {
          where: { organization_id: string };
          take: number;
          skip?: number;
        }) =>
          records
            .filter((row) => row.organization_id === where.organization_id)
            .slice(skip, skip + take),
      },
    } as never);
    await expect(
      service.extract({
        organizationId: ORG_A,
        source: "integracao.projects",
        fields: ["name"],
        limit: 1,
        query: {
          filters: [{ field: "name", operator: "eq", parameter: "name", value: "Projeto 149" }],
        },
      }),
    ).resolves.toEqual({ rows: [{ name: "Projeto 149" }], reachedLimit: false });
  });
  it("extrai somente campos publicados na organização do grant e identifica corte", async () => {
    const projects = {
      findMany: vi
        .fn()
        .mockResolvedValue([
          { name: "Projeto A" },
          { name: "Projeto A2" },
          { name: "Projeto não retornado" },
        ]),
    };
    const service = new InternalReportingService({ project: projects } as never);

    await expect(
      service.extract({
        organizationId: ORG_A,
        source: "integracao.projects",
        fields: ["name"],
        limit: 2,
      }),
    ).resolves.toEqual({
      rows: [{ name: "Projeto A" }, { name: "Projeto A2" }],
      reachedLimit: true,
    });
    expect(projects.findMany).toHaveBeenCalledWith({
      where: { organization_id: ORG_A },
      select: { name: true },
      take: 3,
    });
    expect(projects.findMany).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { organization_id: ORG_B } }),
    );
  });

  it("recusa chaves que não são campos de relatório", async () => {
    const projects = { findMany: vi.fn() };
    const service = new InternalReportingService({ project: projects } as never);

    await expect(
      service.extract({
        organizationId: ORG_A,
        source: "integracao.projects",
        fields: ["client_id"],
        limit: 1,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(projects.findMany).not.toHaveBeenCalled();
  });
});
