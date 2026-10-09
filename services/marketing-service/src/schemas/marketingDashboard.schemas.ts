import { z } from "zod";

export const marketingDashboardResponseSchema = z.object({
  birthdayMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
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
        z.object({
          id: z.string(),
          name: z.string(),
          date: z.string(),
          day: z.number().int().min(1).max(31),
        }),
      ),
    }),
    employees: z.object({
      total: z.number().int().nonnegative(),
      items: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          date: z.string(),
          day: z.number().int().min(1).max(31),
          department: z.string().nullable(),
        }),
      ),
    }),
    companies: z.object({
      total: z.number().int().nonnegative(),
      items: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          date: z.string(),
          day: z.number().int().min(1).max(31),
        }),
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

export const marketingDashboardQuerySchema = z
  .object({
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Mês inválido. Use o formato AAAA-MM."),
  })
  .partial()
  .strict();

export type MarketingDashboardQuery = z.infer<typeof marketingDashboardQuerySchema>;

export type MarketingDashboardResponse = z.infer<typeof marketingDashboardResponseSchema>;
