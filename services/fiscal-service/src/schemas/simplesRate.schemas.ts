import { z } from "zod";

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
    annex: z.enum(["I", "II", "III", "IV", "V"], { message: "Anexo inválido." }),
  })
  .strict();
