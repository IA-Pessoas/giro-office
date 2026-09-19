import { z } from "zod";

import { TRIAGE_CATALOG_CODE_MAX_LENGTH } from "../services/triageCatalog.constants.js";

const competenceSchema = z
  .string({ required_error: "Competência é obrigatória." })
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Competência deve estar no formato AAAA-MM.");

const clientIdSchema = z.string().uuid("Cliente inválido.");
const responsibleIdSchema = z.string().uuid("Responsável inválido.");
const externalLinkTypeSchema = z
  .string()
  .trim()
  .min(1, "Tipo de link é obrigatório.")
  .max(TRIAGE_CATALOG_CODE_MAX_LENGTH, "Tipo de link excede o limite permitido.");
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
    client_id: clientIdSchema,
    competence: competenceSchema,
    include_archived: z
      .enum(["true", "false", "1", "0"])
      .transform((value) => value === "true" || value === "1")
      .optional()
      .default("false"),
  })
  .strict();

export const triageExternalLinkIdParamsSchema = z.object({
  id: z.string().uuid("Link externo inválido."),
});
