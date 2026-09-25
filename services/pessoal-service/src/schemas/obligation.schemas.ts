import { z } from "zod";

export const competenceSchema = z
  .string()
  .regex(/^\d{4}-\d{2}$/, "competência deve estar no formato YYYY-MM.");

export const obligationIdParamsSchema = z
  .object({
    id: z.string().uuid({ message: "id invalido." }),
  })
  .strict();

export const generateObligationsParamsSchema = z
  .object({
    competence: competenceSchema,
  })
  .strict();

export const createObligationBodySchema = z
  .object({
    client_id: z.string().uuid({ message: "client_id invalido." }),
    competence: competenceSchema,
  })
  .strict();

export const detailObligationQuerySchema = z
  .object({
    client_id: z.string().uuid({ message: "client_id invalido." }),
    competence: competenceSchema,
  })
  .strict();

export const updateObligationFieldBodySchema = z
  .object({
    advance: z.boolean().nullable().optional(),
    payroll: z.boolean().nullable().optional(),
    charges: z.boolean().nullable().optional(),
    assistance_fee: z.boolean().nullable().optional(),
    responsavel_id: z.string().uuid({ message: "responsavel_id invalido." }).nullable().optional(),
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
