import { describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "../generated/prisma/client.js";
import { RegularizeDashboardService } from "./regularizeDashboardService.js";

const organizationId = "a0000000-0000-4000-8000-000000000001";

function createPrismaDouble() {
  const recentProcessRows = [
    {
      id: "process-1",
      process_type: "Abertura",
      cpf_cnpj: "12345678901",
      status: "Aberto",
      clientPF: {
        name: "Ana",
        cpf: "12345678901",
        organization_id: organizationId,
      },
      clientPJ: null,
    },
  ];
  const recentProcesses = [
    {
      id: "process-1",
      process_type: "Abertura",
      cpf_cnpj: "12345678901",
      status: "Aberto",
      clientPF: { name: "Ana", cpf: "12345678901" },
      clientPJ: null,
    },
  ];
  const trackedLicenses = [
    {
      id: "license-1",
      type_license: "Alvará",
      protocol: "PROTO-1",
      due_date: new Date("2026-08-01T00:00:00.000Z"),
    },
  ];

  const prisma = {
    process: {
      count: vi.fn().mockResolvedValue(3),
      findMany: vi.fn().mockResolvedValue(recentProcessRows),
    },
    license: {
      count: vi.fn().mockResolvedValue(2),
      findMany: vi.fn().mockResolvedValue(trackedLicenses),
    },
    clientPF: {
      count: vi.fn().mockResolvedValue(5),
    },
    sitePasswordsRegularize: {
      count: vi.fn().mockResolvedValue(7),
    },
    client: {
      count: vi.fn().mockResolvedValueOnce(10).mockResolvedValueOnce(6),
    },
    $transaction: vi.fn(async (operations: Array<Promise<unknown>>) => Promise.all(operations)),
  } as unknown as PrismaClient;

  return { prisma, recentProcesses, trackedLicenses };
}

describe("RegularizeDashboardService", () => {
  it("aggregates dashboard metrics and preview rows for one organization", async () => {
    const { prisma, recentProcesses, trackedLicenses } = createPrismaDouble();

    const result = await new RegularizeDashboardService(prisma).getDashboard(organizationId, 2026);

    expect(result).toEqual({
      year: 2026,
      metrics: {
        openProcesses: 3,
        activeLicenses: 2,
        activeClientPfs: 5,
        activeSites: 7,
        municipalTaxesCompleted: 6,
        municipalTaxesPending: 4,
        municipalTaxesTotal: 10,
      },
      recentProcesses,
      trackedLicenses,
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("scopes every aggregate and nested relation by organization", async () => {
    const { prisma } = createPrismaDouble();

    await new RegularizeDashboardService(prisma).getDashboard(organizationId, 2026);

    expect(prisma.process.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organization_id: organizationId }),
      }),
    );
    expect(prisma.process.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organization_id: organizationId },
        take: 6,
        orderBy: { entry_date: "desc" },
        select: expect.objectContaining({
          clientPF: {
            where: { organization_id: organizationId },
            select: { name: true, cpf: true, organization_id: true },
          },
          clientPJ: {
            where: { organization_id: organizationId },
            select: { name: true, cpf_cnpj: true, organization_id: true },
          },
        }),
      }),
    );
    expect(prisma.license.count).toHaveBeenCalledWith({
      where: { organization_id: organizationId, status: "Ativo" },
    });
    expect(prisma.clientPF.count).toHaveBeenCalledWith({
      where: { organization_id: organizationId, status: "Ativo" },
    });
    expect(prisma.sitePasswordsRegularize.count).toHaveBeenCalledWith({
      where: { organization_id: organizationId, status: true },
    });
    expect(prisma.client.count).toHaveBeenLastCalledWith({
      where: {
        organization_id: organizationId,
        status: "Ativo",
        municipalTaxes: {
          some: { organization_id: organizationId, year: 2026 },
        },
      },
    });
  });

  it("drops relation data from another organization", async () => {
    const { prisma } = createPrismaDouble();
    vi.mocked(prisma.process.findMany).mockResolvedValueOnce([
      {
        id: "process-1",
        process_type: "Abertura",
        cpf_cnpj: "12345678901",
        status: "Aberto",
        clientPF: {
          name: "Outro tenant",
          cpf: "98765432100",
          organization_id: "organization-2",
        },
        clientPJ: null,
      },
    ] as never);

    const result = await new RegularizeDashboardService(prisma).getDashboard(organizationId, 2026);

    expect(result.recentProcesses[0]?.clientPF).toBeNull();
  });

  it("selects no credential secrets and never returns a negative pending count", async () => {
    const { prisma } = createPrismaDouble();
    vi.mocked(prisma.client.count).mockReset();
    vi.mocked(prisma.client.count).mockResolvedValueOnce(2).mockResolvedValueOnce(3);

    const result = await new RegularizeDashboardService(prisma).getDashboard(organizationId, 2026);

    expect(result.metrics.municipalTaxesPending).toBe(0);
    expect(JSON.stringify(vi.mocked(prisma.sitePasswordsRegularize.count).mock.calls)).not.toMatch(
      /password|login|notes/,
    );
  });

  it("propagates Prisma failures instead of returning empty dashboard data", async () => {
    const { prisma } = createPrismaDouble();
    vi.mocked(prisma.process.count).mockRejectedValueOnce(new Error("database unavailable"));

    await expect(
      new RegularizeDashboardService(prisma).getDashboard(organizationId, 2026),
    ).rejects.toThrow("database unavailable");
  });
});
