import type { PrismaClient } from "../generated/prisma/client.js";
import type { TiDashboardSummary } from "../schemas/tiDashboard.schemas.js";
import type { TiAuthContext } from "./tiRequestService.js";

const openRequestStatuses = ["Resolved", "Closed"] as const;
const criticalRequestUrgencies = ["High", "Critical"] as const;

function sevenDaysAgo(): Date {
  return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
}

export class TiDashboardService {
  constructor(private readonly prisma: PrismaClient) {}

  async getSummary(context: Pick<TiAuthContext, "organizationId">): Promise<TiDashboardSummary> {
    const organizationWhere = { organization_id: context.organizationId };
    const technologyDepartment = await this.prisma.department.findFirst({
      where: {
        ...organizationWhere,
        name: { equals: "Tecnologia", mode: "insensitive" },
      },
      select: { id: true },
    });

    const [
      openRequests,
      criticalRequests,
      resolvedLastSevenDays,
      inventoryAssets,
      assignedInventoryAssets,
      pendingTerms,
      lowStockItems,
      activeRobots,
    ] = await Promise.all([
      this.prisma.tIRequest.count({
        where: {
          ...organizationWhere,
          status: { notIn: [...openRequestStatuses] },
        },
      }),
      this.prisma.tIRequest.count({
        where: {
          ...organizationWhere,
          urgency: { in: [...criticalRequestUrgencies] },
          status: { notIn: [...openRequestStatuses] },
        },
      }),
      this.prisma.tIRequest.count({
        where: {
          ...organizationWhere,
          status: "Resolved",
          updated_at: { gte: sevenDaysAgo() },
        },
      }),
      this.prisma.inventoryTecnologia.count({
        where: organizationWhere,
      }),
      this.prisma.inventoryTecnologia.count({
        where: {
          ...organizationWhere,
          user_id: { not: null },
        },
      }),
      this.prisma.termTecnologia.count({
        where: {
          ...organizationWhere,
          reason: null,
        },
      }),
      technologyDepartment
        ? this.prisma.stock.count({
            where: {
              ...organizationWhere,
              department_id: technologyDepartment.id,
              status: true,
              quantity: { lte: 0 },
            },
          })
        : Promise.resolve(0),
      this.prisma.tIRobot.count({
        where: {
          ...organizationWhere,
          active: true,
        },
      }),
    ]);

    return {
      openRequests,
      criticalRequests,
      resolvedLastSevenDays,
      inventoryAssets,
      assignedInventoryAssets,
      pendingTerms,
      lowStockItems,
      activeRobots,
    };
  }
}
