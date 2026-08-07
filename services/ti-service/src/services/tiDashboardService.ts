import type { PrismaClient } from "../generated/prisma/client.js";
import { TiPermissionLevel } from "../middlewares/requireTiPermission.js";
import type { TiDashboardSummary } from "../schemas/tiDashboard.schemas.js";
import type { TiAuthContext } from "./tiRequestService.js";

const openRequestStatuses = ["Resolved", "Closed"] as const;
const criticalRequestUrgencies = ["High", "Critical"] as const;

function sevenDaysAgo(): Date {
  return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
}

export class TiDashboardService {
  constructor(private readonly prisma: PrismaClient) {}

  async getSummary(context: TiAuthContext): Promise<TiDashboardSummary> {
    const organizationWhere = { organization_id: context.organizationId };
    const isViewer = context.permission < TiPermissionLevel.Technician;
    const requesterWhere = isViewer ? { requester_id: context.userId } : {};
    const requestWhere = { ...organizationWhere, ...requesterWhere };

    const openRequests = await this.prisma.tIRequest.count({
      where: {
        ...requestWhere,
        status: { notIn: [...openRequestStatuses] },
      },
    });
    const criticalRequests = await this.prisma.tIRequest.count({
      where: {
        ...requestWhere,
        urgency: { in: [...criticalRequestUrgencies] },
        status: { notIn: [...openRequestStatuses] },
      },
    });
    const resolvedLastSevenDays = await this.prisma.tIRequest.count({
      where: {
        ...requestWhere,
        status: "Resolved",
        updated_at: { gte: sevenDaysAgo() },
      },
    });
    const closedRequests = await this.prisma.tIRequest.count({
      where: {
        ...requestWhere,
        status: "Closed",
      },
    });

    if (isViewer) {
      return {
        scope: "self",
        openRequests,
        criticalRequests,
        resolvedLastSevenDays,
        closedRequests,
      };
    }

    const technologyDepartment = await this.prisma.department.findFirst({
      where: {
        ...organizationWhere,
        name: { equals: "Tecnologia", mode: "insensitive" },
      },
      select: { id: true },
    });
    const inventoryAssets = await this.prisma.inventoryTecnologia.count({
      where: organizationWhere,
    });
    const assignedInventoryAssets = await this.prisma.inventoryTecnologia.count({
      where: {
        ...organizationWhere,
        user_id: { not: null },
      },
    });
    const pendingTerms = await this.prisma.termTecnologia.count({
      where: {
        ...organizationWhere,
        signed_at: null,
      },
    });
    const lowStockItems = technologyDepartment
      ? await this.prisma.stock.count({
          where: {
            ...organizationWhere,
            department_id: technologyDepartment.id,
            status: true,
            quantity: { lte: 0 },
          },
        })
      : 0;
    const activeRobots = await this.prisma.tIRobot.count({
      where: {
        ...organizationWhere,
        active: true,
      },
    });

    return {
      scope: "organization",
      openRequests,
      criticalRequests,
      resolvedLastSevenDays,
      closedRequests,
      inventoryAssets,
      assignedInventoryAssets,
      pendingTerms,
      lowStockItems,
      activeRobots,
    };
  }
}
