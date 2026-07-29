import { z } from "zod";

const requestMetricsSchema = z.object({
  openRequests: z.number().int().min(0),
  criticalRequests: z.number().int().min(0),
  resolvedLastSevenDays: z.number().int().min(0),
  closedRequests: z.number().int().min(0),
});

export const tiDashboardSummarySchema = z.discriminatedUnion("scope", [
  requestMetricsSchema.extend({
    scope: z.literal("self"),
  }),
  requestMetricsSchema.extend({
    scope: z.literal("organization"),
    inventoryAssets: z.number().int().min(0),
    assignedInventoryAssets: z.number().int().min(0),
    pendingTerms: z.number().int().min(0),
    lowStockItems: z.number().int().min(0),
    activeRobots: z.number().int().min(0),
  }),
]);

export type TiDashboardSummary = z.infer<typeof tiDashboardSummarySchema>;
