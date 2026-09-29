import { z } from "zod";

import { SIMPLES_ANNEX_NAMES } from "../services/simplesNationalService.js";
import { competenceSchema } from "./competence.schemas.js";

export const simplesPreviewQuerySchema = z
  .object({
    client_id: z.string().uuid("Cliente inválido."),
    competence: competenceSchema,
  })
  .strict();

export const simplesBatchBodySchema = z
  .object({
    competence: competenceSchema,
    annex: z.enum(SIMPLES_ANNEX_NAMES, { message: "Anexo inválido." }),
    documents: z
      .array(z.string().trim().max(20, "CPF/CNPJ inválido."), {
        message: "Informe os CPF/CNPJ do lote.",
      })
      .min(1, "Informe ao menos um CPF/CNPJ.")
      .max(500, "Lote limitado a 500 CPF/CNPJ."),
  })
  .strict();

export const simplesPdfQuerySchema = z
  .object({
    ...simplesPreviewQuerySchema.shape,
    annex: z.enum(SIMPLES_ANNEX_NAMES, { message: "Anexo inválido." }),
  })
  .strict();
