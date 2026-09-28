import { z } from "zod";

export const marketingDashboardResponseSchema = z.object({
  requests: z.object({
    active: z.object({
      total: z.number().int().nonnegative(),
      rh: z.number().int().nonnegative(),
      ti: z.number().int().nonnegative(),
    }),
    new: z.object({
      total: z.number().int().nonnegative(),
      rh: z.number().int().nonnegative(),
      ti: z.number().int().nonnegative(),
    }),
    urgent: z.object({
      total: z.number().int().nonnegative(),
      rh: z.number().int().nonnegative(),
      ti: z.number().int().nonnegative(),
    }),
  }),
  birthdays: z.object({
    clients: z.object({
      total: z.number().int().nonnegative(),
      items: z.array(
        z.object({ id: z.string(), name: z.string(), day: z.number().int().min(1).max(31) }),
      ),
    }),
    employees: z.object({
      total: z.number().int().nonnegative(),
      items: z.array(
        z.object({ id: z.string(), name: z.string(), day: z.number().int().min(1).max(31) }),
      ),
    }),
    companies: z.object({
      total: z.number().int().nonnegative(),
      items: z.array(
        z.object({ id: z.string(), name: z.string(), day: z.number().int().min(1).max(31) }),
      ),
    }),
  }),
  alerts: z.array(
    z.object({
      code: z.enum(["new-requests", "urgent-requests"]),
      count: z.number().int().positive(),
      label: z.string(),
    }),
  ),
});

export type MarketingDashboardResponse = z.infer<typeof marketingDashboardResponseSchema>;
