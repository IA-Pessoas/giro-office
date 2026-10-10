import { z } from "zod";

const competenceSchema = z
  .string({ required_error: "Competência é obrigatória." })
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Competência deve estar no formato AAAA-MM.");

export const createTriageSolicitationBodySchema = z
  .object({
    client_id: z.string().uuid("Cliente inválido."),
    competence: competenceSchema,
    category_id: z.string().uuid("Categoria é obrigatória."),
    description: z.string().trim().min(1).max(2000),
    responsible_id: z.string().uuid("Responsável é obrigatório."),
  })
  .strict();

export const listTriageSolicitationQuerySchema = z
  .object({
    status: z.enum(["OPEN", "CLOSED"]).optional(),
    client_id: z.string().uuid("Cliente inválido.").optional(),
    competence: competenceSchema.optional(),
  })
  .strict();

export const triageSolicitationIdParamsSchema = z
  .object({ id: z.string().uuid("Solicitação inválida.") })
  .strict();
