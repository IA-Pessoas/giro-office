import { describe, expect, it, vi } from "vitest";

import {
  getCurrentMarketingCompetence,
  MarketingDashboardService,
} from "../services/marketingDashboardService.js";

const organizationId = "10000000-0000-4000-8000-000000000001";

describe("MarketingDashboardService", () => {
  it("calcula a competência atual no fuso da organização", () => {
    expect(
      getCurrentMarketingCompetence(new Date("2026-03-01T00:30:00.000Z"), "America/Los_Angeles"),
    ).toEqual(new Date("2026-02-01T00:00:00.000Z"));
  });

  it("returns organization-scoped request counts and canonical monthly birthdays", async () => {
    const prisma = {
      organization: { findUnique: vi.fn().mockResolvedValue({ timezone: "America/Sao_Paulo" }) },
      marketingAiUsageControl: { count: vi.fn().mockResolvedValue(2) },
      rhRequest: {
        count: vi.fn().mockResolvedValueOnce(3).mockResolvedValueOnce(1).mockResolvedValueOnce(1),
      },
      tIRequest: {
        count: vi.fn().mockResolvedValueOnce(2).mockResolvedValueOnce(1).mockResolvedValueOnce(1),
      },
      $queryRaw: vi
        .fn()
        .mockResolvedValueOnce([{ total: 2, items: [{ id: "client", name: "Cliente", day: 29 }] }])
        .mockResolvedValueOnce([
          { total: 1, items: [{ id: "employee", name: "Colaboradora", day: 30 }] },
        ])
        .mockResolvedValueOnce([
          { total: 1, items: [{ id: "company", name: "Empresa", day: 31 }] },
        ]),
      $transaction: vi.fn(async (operations: Promise<unknown>[]) => Promise.all(operations)),
    };

    const dashboard = await new MarketingDashboardService(prisma as never).getDashboard(
      organizationId,
    );

    expect(dashboard.requests).toEqual({
      active: { total: 5, rh: 3, ti: 2 },
      new: { total: 2, rh: 1, ti: 1 },
      urgent: { total: 2, rh: 1, ti: 1 },
    });
    expect(dashboard.birthdays).toEqual({
      clients: { total: 2, items: [{ id: "client", name: "Cliente", day: 29 }] },
      employees: { total: 1, items: [{ id: "employee", name: "Colaboradora", day: 30 }] },
      companies: { total: 1, items: [{ id: "company", name: "Empresa", day: 31 }] },
    });
    expect(dashboard.alerts).toEqual([
      { code: "new-requests", count: 2, label: "Solicitações novas" },
      { code: "urgent-requests", count: 2, label: "Solicitações urgentes em aberto" },
      { code: "pending-ai-knowledge", count: 2, label: "Conhecimento de IA pendente" },
    ]);
    expect(dashboard.aiUsage.pendingKnowledge).toBe(2);
    expect(dashboard.aiUsage.competence).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
    expect(dashboard.alerts).toContainEqual({
      code: "pending-ai-knowledge",
      count: 2,
      label: "Conhecimento de IA pendente",
    });
    expect(prisma.marketingAiUsageControl.count).toHaveBeenCalledWith({
      where: {
        organization_id: organizationId,
        competence: expect.any(Date),
        knowledge: null,
      },
    });
  });

  it("scopes request counts to the authenticated organization and excludes resolved requests", async () => {
    const prisma = {
      organization: { findUnique: vi.fn().mockResolvedValue({ timezone: "UTC" }) },
      marketingAiUsageControl: { count: vi.fn().mockResolvedValue(0) },
      rhRequest: { count: vi.fn().mockResolvedValue(0) },
      tIRequest: { count: vi.fn().mockResolvedValue(0) },
      $queryRaw: vi.fn().mockResolvedValue([{ total: 0, items: [] }]),
      $transaction: vi.fn(async (operations: Promise<unknown>[]) => Promise.all(operations)),
    };

    await new MarketingDashboardService(prisma as never).getDashboard(organizationId);

    expect(prisma.rhRequest.count).toHaveBeenCalledWith({
      where: {
        organization_id: organizationId,
        status: { notIn: ["Resolved", "Closed"] },
      },
    });
    expect(prisma.tIRequest.count).toHaveBeenCalledWith({
      where: {
        organization_id: organizationId,
        status: { notIn: ["Resolved", "Closed"] },
      },
    });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(3);
    for (const queryCall of prisma.$queryRaw.mock.calls) {
      expect(queryCall[0]?.join("?")).not.toContain("position <= 8");
    }
    const employeeBirthdaysQuery = prisma.$queryRaw.mock.calls[1]?.[0];
    expect(employeeBirthdaysQuery?.join("?")).toContain("employee.status = 'active'");
    expect(employeeBirthdaysQuery?.join("?")).toContain("department.organization_id = ?");
    expect(prisma.$queryRaw.mock.calls[1]?.slice(1)).toEqual([
      organizationId,
      organizationId,
      organizationId,
    ]);
    for (const queryCall of prisma.$queryRaw.mock.calls) {
      for (const queryOrganizationId of queryCall.slice(1)) {
        expect(queryOrganizationId).toBe(organizationId);
      }
    }
  });
});
