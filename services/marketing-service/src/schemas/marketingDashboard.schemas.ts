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
  aiUsage: z.object({
    competence: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
    pendingKnowledge: z.number().int().nonnegative(),
  }),
  alerts: z.array(
    z.object({
      code: z.enum(["new-requests", "urgent-requests", "pending-ai-knowledge"]),
      count: z.number().int().positive(),
      label: z.string(),
    }),
  ),
});

export type MarketingDashboardResponse = z.infer<typeof marketingDashboardResponseSchema>;

export const marketingBirthdayMonthSchema = z.coerce.number().int().min(1).max(12);

export const marketingMonthlyBirthdaysQuerySchema = z.object({
  month: marketingBirthdayMonthSchema,
});

const birthdayItemFields = {
  id: z.string(),
  name: z.string(),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  day: z.number().int().min(1).max(31),
};

export const marketingMonthlyBirthdaysResponseSchema = z.object({
  month: marketingBirthdayMonthSchema,
  employees: z.object({
    total: z.number().int().nonnegative(),
    items: z.array(z.object({ ...birthdayItemFields, department: z.string().nullable() })),
  }),
  clients: z.object({
    total: z.number().int().nonnegative(),
    items: z.array(z.object({ ...birthdayItemFields, companies: z.string() })),
  }),
});

export type MarketingMonthlyBirthdaysResponse = z.infer<
  typeof marketingMonthlyBirthdaysResponseSchema
>;

export const marketingStockResponseSchema = z.object({
  department: z.object({ id: z.string(), name: z.string() }),
  totals: z.object({
    items: z.number().int().nonnegative(),
    quantity: z.number().int(),
  }),
  items: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      quantity: z.number().int(),
      lastEntryAt: z.string().datetime().nullable(),
      lastExitAt: z.string().datetime().nullable(),
    }),
  ),
});

export type MarketingStockResponse = z.infer<typeof marketingStockResponseSchema>;
