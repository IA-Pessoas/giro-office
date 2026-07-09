export interface TiDashboardSummary {
  openRequests: number;
  criticalRequests: number;
  resolvedLastSevenDays: number;
  inventoryAssets: number;
  assignedInventoryAssets: number;
  pendingTerms: number;
  lowStockItems: number;
  activeRobots: number;
  [key: string]: unknown;
}
