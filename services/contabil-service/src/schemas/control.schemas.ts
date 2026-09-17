import { z } from "zod";

const competenceSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "competence deve estar no formato YYYY-MM.");

export const createControlBodySchema = z
  .object({
    client_id: z.string().uuid({ message: "client_id inválido." }),
    competence: competenceSchema,
  })
  .strict();

export const createYearControlsBodySchema = z
  .object({
    client_id: z.string().uuid({ message: "client_id inválido." }),
    year: z.number().int().min(2000).max(2100),
    confirmed: z.literal(true, {
      errorMap: () => ({ message: "Confirmação explícita é obrigatória." }),
    }),
  })
  .strict();

export const controlCompetenceBodySchema = z
  .object({
    client_id: z.string().uuid({ message: "client_id inválido." }),
    competence: competenceSchema,
  })
  .strict();

export const updateControlFieldBodySchema = z
  .object({
    field: z.string().min(1, "Campo obrigatório."),
    value: z.union([z.boolean(), z.string()]),
  })
  .strict();

export const controlIdParamsSchema = z
  .object({
    id: z.string().uuid({ message: "id inválido." }),
  })
  .strict();

export const detailControlQuerySchema = z
  .object({
    client_id: z.string().uuid({ message: "client_id inválido." }),
    competence: competenceSchema,
  })
  .strict();

export const listControlQuerySchema = z
  .object({
    competence: competenceSchema,
  })
  .strict();
