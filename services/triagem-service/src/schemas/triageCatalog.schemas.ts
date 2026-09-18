import { z } from "zod";
import { TRIAGE_CATALOG_KINDS } from "../services/triageCatalog.constants.js";

export const triageCatalogKindSchema = z.enum(TRIAGE_CATALOG_KINDS);

const codeSchema = z
  .string({ required_error: "Código é obrigatório." })
  .trim()
  .min(1, "Código é obrigatório.")
  .max(100, "Código excede o limite permitido.");
const labelSchema = z
  .string({ required_error: "Rótulo é obrigatório." })
  .trim()
  .min(1, "Rótulo é obrigatório.")
  .max(255, "Rótulo excede o limite permitido.");
const urlSchema = z
  .string()
  .trim()
  .url("URL inválida.")
  .max(2048, "URL excede o limite permitido.")
  .refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  }, "A URL deve usar HTTPS.");

export const createTriageCatalogBodySchema = z
  .object({
    kind: triageCatalogKindSchema,
    code: codeSchema,
    label: labelSchema,
    url: urlSchema.optional(),
  })
  .strict();

export const updateTriageCatalogBodySchema = z
  .object({
    kind: triageCatalogKindSchema.optional(),
    code: codeSchema.optional(),
    label: labelSchema.optional(),
    url: urlSchema.nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "Informe ao menos um campo para atualizar.");

export const listTriageCatalogQuerySchema = z
  .object({
    kind: triageCatalogKindSchema.optional(),
    include_archived: z
      .enum(["true", "false", "1", "0"])
      .transform((value) => value === "true" || value === "1")
      .optional()
      .default("false"),
  })
  .strict();

export const triageCatalogIdParamsSchema = z.object({
  id: z.string().uuid("Item de catálogo inválido."),
});
