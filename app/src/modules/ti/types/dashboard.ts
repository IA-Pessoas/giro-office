interface TiDashboardRequestMetrics {
  openRequests: number;
  criticalRequests: number;
  resolvedLastSevenDays: number;
  closedRequests: number;
}

export type TiDashboardSummary = TiDashboardRequestMetrics &
  (
    | {
        scope: "self";
      }
    | {
        scope: "organization";
        inventoryAssets: number;
        assignedInventoryAssets: number;
        pendingTerms: number;
        lowStockItems: number;
        activeRobots: number;
      }
  );
