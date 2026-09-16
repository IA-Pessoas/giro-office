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
