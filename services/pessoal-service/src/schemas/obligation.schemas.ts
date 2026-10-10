import { z } from "zod";

export const competenceSchema = z
  .string()
  .regex(/^\d{4}-\d{2}$/, "competência deve estar no formato YYYY-MM.");

export const obligationIdParamsSchema = z
  .object({
    id: z.string().uuid({ message: "id inválido." }),
  })
  .strict();

export const generateObligationsParamsSchema = z
  .object({
    competence: competenceSchema,
  })
  .strict();

export const createObligationBodySchema = z
  .object({
    client_id: z.string().uuid({ message: "client_id inválido." }),
    competence: competenceSchema,
  })
  .strict();

export const detailObligationQuerySchema = z
  .object({
    client_id: z.string().uuid({ message: "client_id inválido." }),
    competence: competenceSchema,
  })
  .strict();

export const updateObligationFieldBodySchema = z
  .object({
    advance: z.boolean().nullable().optional(),
    payroll: z.boolean().nullable().optional(),
    charges: z.boolean().nullable().optional(),
    assistance_fee: z.boolean().nullable().optional(),
    responsavel_id: z.string().uuid({ message: "responsavel_id inválido." }).nullable().optional(),
    bem_mais: z.boolean().nullable().optional(),
    bsf: z.boolean().nullable().optional(),
    va: z.boolean().nullable().optional(),
    vt: z.boolean().nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length === 1, {
    message: "Informe exatamente um campo para atualizar.",
  });

export type CreateObligationBody = z.infer<typeof createObligationBodySchema>;
export type DetailObligationQuery = z.infer<typeof detailObligationQuerySchema>;
export type UpdateObligationFieldBody = z.infer<typeof updateObligationFieldBodySchema>;

export const OBLIGATION_ITEMS = [
  "advance",
  "payroll",
  "charges",
  "assistance_fee",
  "bem_mais",
  "bsf",
  "va",
  "vt",
] as const;

/** Estado do item na carteira: pendente (false), concluído (true), não possui (null). */
export const OBLIGATION_ITEM_STATES = ["pending", "done", "none"] as const;

export const listObligationPortfolioQuerySchema = z
  .object({
    competence: competenceSchema,
    // "none" filtra obrigações sem responsável.
    responsavel_id: z
      .union([z.string().uuid({ message: "responsavel_id inválido." }), z.literal("none")])
      .optional(),
    group_id: z.string().uuid({ message: "group_id inválido." }).optional(),
    item: z.enum(OBLIGATION_ITEMS).optional(),
    state: z.enum(OBLIGATION_ITEM_STATES).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict()
  .refine((value) => !value.state || value.item || value.state === "pending", {
    message: "Informe o item para filtrar por concluído ou não possui.",
    path: ["item"],
  });

export type ListObligationPortfolioQuery = z.infer<typeof listObligationPortfolioQuerySchema>;

export const obligationHistoryQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export type ObligationHistoryQuery = z.infer<typeof obligationHistoryQuerySchema>;
