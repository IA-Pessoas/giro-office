import { z } from "zod";

import { SIMPLES_ANNEX_NAMES } from "../services/simplesNationalService.js";
import { competenceSchema } from "./competence.schemas.js";

export const simplesPreviewQuerySchema = z
  .object({
    client_id: z.string().uuid("Cliente inválido."),
    competence: competenceSchema,
  })
  .strict();

export const simplesPdfQuerySchema = z
  .object({
    ...simplesPreviewQuerySchema.shape,
    annex: z.enum(SIMPLES_ANNEX_NAMES, { message: "Anexo inválido." }),
  })
  .strict();
