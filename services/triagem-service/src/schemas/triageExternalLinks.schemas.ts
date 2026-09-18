import { z } from "zod";

const competenceSchema = z
  .string({ required_error: "Competência é obrigatória." })
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Competência deve estar no formato AAAA-MM.");

const clientIdSchema = z.string().uuid("Cliente inválido.");
const responsibleIdSchema = z.string().uuid("Responsável inválido.");
const externalLinkTypeSchema = z.enum(["CLOUD", "DRIVE"], {
  errorMap: () => ({ message: "Tipo de link inválido." }),
});
const httpsUrlSchema = z
  .string({ required_error: "URL do link é obrigatória." })
  .url("URL do link inválida.")
  .max(2048, "URL do link excede o limite permitido.")
  .refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  }, "O link deve usar uma URL HTTPS válida.");
const descriptionSchema = z
  .string()
  .trim()
  .max(500, "Descrição excede o limite permitido.")
  .nullable()
  .optional();

export const createTriageExternalLinkBodySchema = z
  .object({
    client_id: clientIdSchema,
    competence: competenceSchema,
    type: externalLinkTypeSchema,
    url: httpsUrlSchema,
    description: descriptionSchema,
    responsible_id: responsibleIdSchema.nullable().optional(),
  })
  .strict();

export const updateTriageExternalLinkBodySchema = z
  .object({
    type: externalLinkTypeSchema,
    url: httpsUrlSchema,
    description: descriptionSchema,
    responsible_id: responsibleIdSchema.nullable().optional(),
  })
  .strict();

export const listTriageExternalLinkQuerySchema = z
  .object({
    client_id: clientIdSchema.optional(),
    competence: competenceSchema.optional(),
    include_archived: z
      .preprocess((value) => value === "true" || value === "1", z.boolean())
      .optional()
      .default(false),
  })
  .strict();

export const triageExternalLinkIdParamsSchema = z.object({
  id: z.string().uuid("Link externo inválido."),
});
