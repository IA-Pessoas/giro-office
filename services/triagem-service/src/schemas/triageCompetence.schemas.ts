import { z } from "zod";

const competenceSchema = z
  .string({ required_error: "Competência é obrigatória." })
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Competência deve estar no formato AAAA-MM.");

const clientIdSchema = z.string().uuid("Cliente inválido.");

export const createTriageCompetenceBodySchema = z
  .object({ client_id: clientIdSchema, competence: competenceSchema })
  .strict();

export const listTriageCompetenceQuerySchema = z
  .object({
    client_id: clientIdSchema.optional(),
    competence: competenceSchema.optional(),
    include_archived: z
      .preprocess((value) => value === "true" || value === "1", z.boolean())
      .optional()
      .default(false),
  })
  .strict();

export const triageCompetenceIdParamsSchema = z.object({
  id: z.string().uuid("Competência inválida."),
});
