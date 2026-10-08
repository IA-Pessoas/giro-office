import { z } from "zod";

export type CreateMarketingEventInput = z.infer<typeof createMarketingEventBodySchema>;
export type UpdateMarketingEventInput = z.infer<typeof updateMarketingEventBodySchema>;

export const MARKETING_EVENT_STATUSES = [
  "Novo",
  "Em andamento",
  "Concluído",
  "Descontinuado",
] as const;

export const MARKETING_EVENT_PRIORITIES = ["Baixa", "Média", "Alta"] as const;
export const DEFAULT_MARKETING_EVENT_STATUS = "Novo" as const;

export type MarketingEventStatus = (typeof MARKETING_EVENT_STATUSES)[number];
export type MarketingEventPriority = (typeof MARKETING_EVENT_PRIORITIES)[number];

export const marketingEventIdParamsSchema = z
  .object({
    id: z.string().uuid({ message: "Identificador do evento inválido." }),
  })
  .strict();

export const createMarketingEventBodySchema = z
  .object({
    name: z
      .string()
      .min(1, "Informe o nome do evento.")
      .max(50)
      .refine((name) => name.trim().length > 0, "Informe o nome do evento."),
    logo: z.string().max(100).optional().default(""),
    priority: z.enum(MARKETING_EVENT_PRIORITIES),
    objective: z.string().optional().default(""),
    audience: z.string().optional().default(""),
  })
  .strict();

export const updateMarketingEventBodySchema = z
  .object({
    name: z
      .string()
      .min(1, "Informe o nome do evento.")
      .max(50)
      .refine((name) => name.trim().length > 0, "Informe o nome do evento.")
      .optional(),
    logo: z.string().max(100).optional(),
    status: z.enum(MARKETING_EVENT_STATUSES).optional(),
    priority: z.enum(MARKETING_EVENT_PRIORITIES).optional(),
    objective: z.string().optional(),
    audience: z.string().optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message: "Informe ao menos um campo para atualizar.",
  });
