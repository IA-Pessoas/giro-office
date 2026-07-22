import "./envBootstrap.js";

import { describe, expect, it, vi } from "vitest";

import { TiDashboardService } from "../services/tiDashboardService.js";

const context = {
  organizationId: "10000000-0000-4000-8000-000000000001",
  userId: "00000000-0000-4000-8000-000000000001",
  permission: 1,
};
const technologyDepartmentId = "50000000-0000-4000-8000-000000000001";

describe("TiDashboardService", () => {
  it("loads dashboard counters sequentially to avoid exhausting session pool connections", async () => {
    let activeQueries = 0;
    let maxActiveQueries = 0;
    const trackCount = vi.fn(async () => {
      activeQueries += 1;
      maxActiveQueries = Math.max(maxActiveQueries, activeQueries);
      await Promise.resolve();
      activeQueries -= 1;

      return 0;
    });
    const prisma = {
      tIRequest: { count: trackCount },
      inventoryTecnologia: { count: trackCount },
      termTecnologia: { count: trackCount },
      department: { findFirst: vi.fn(async () => ({ id: technologyDepartmentId })) },
      stock: { count: trackCount },
      tIRobot: { count: trackCount },
    };
    const service = new TiDashboardService(prisma as never);

    await service.getSummary(context);

    expect(maxActiveQueries).toBe(1);
  });

  it("returns zeroed optional domains when stock and robots have no rows", async () => {
    const prisma = {
      tIRequest: { count: vi.fn(async () => 2) },
      inventoryTecnologia: { count: vi.fn(async () => 5) },
      termTecnologia: { count: vi.fn(async () => 1) },
      department: { findFirst: vi.fn(async () => ({ id: technologyDepartmentId })) },
      stock: { count: vi.fn(async () => 0) },
      tIRobot: { count: vi.fn(async () => 0) },
    };
    const service = new TiDashboardService(prisma as never);

    const result = await service.getSummary(context);

    expect(result).toMatchObject({
      openRequests: 2,
      inventoryAssets: 5,
      pendingTerms: 1,
      lowStockItems: 0,
      activeRobots: 0,
    });
  });

  it("scopes every dashboard counter to the authenticated organization", async () => {
    const prisma = {
      tIRequest: { count: vi.fn(async () => 1) },
      inventoryTecnologia: { count: vi.fn(async () => 1) },
      termTecnologia: { count: vi.fn(async () => 1) },
      department: { findFirst: vi.fn(async () => ({ id: technologyDepartmentId })) },
      stock: { count: vi.fn(async () => 1) },
      tIRobot: { count: vi.fn(async () => 1) },
    };
    const service = new TiDashboardService(prisma as never);

    await service.getSummary(context);

    expect(prisma.tIRequest.count).toHaveBeenCalledWith({
      where: {
        organization_id: context.organizationId,
        status: { notIn: ["Resolved", "Closed"] },
      },
    });
    expect(prisma.tIRequest.count).toHaveBeenCalledWith({
      where: {
        organization_id: context.organizationId,
        urgency: { in: ["High", "Critical"] },
        status: { notIn: ["Resolved", "Closed"] },
      },
    });
    expect(prisma.inventoryTecnologia.count).toHaveBeenCalledWith({
      where: { organization_id: context.organizationId },
    });
    expect(prisma.inventoryTecnologia.count).toHaveBeenCalledWith({
      where: { organization_id: context.organizationId, user_id: { not: null } },
    });
    expect(prisma.termTecnologia.count).toHaveBeenCalledWith({
      where: { organization_id: context.organizationId, reason: null },
    });
    expect(prisma.department.findFirst).toHaveBeenCalledWith({
      where: {
        organization_id: context.organizationId,
        name: { equals: "Tecnologia", mode: "insensitive" },
      },
      select: { id: true },
    });
    expect(prisma.stock.count).toHaveBeenCalledWith({
      where: {
        organization_id: context.organizationId,
        department_id: technologyDepartmentId,
        status: true,
        quantity: { lte: 0 },
      },
    });
    expect(prisma.tIRobot.count).toHaveBeenCalledWith({
      where: { organization_id: context.organizationId, active: true },
    });
  });
});
