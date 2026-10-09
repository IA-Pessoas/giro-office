import { z } from "zod";

import { competenceSchema } from "./competence.schemas.js";
import { CONFERENCE_MAX_BASE64_LENGTH } from "./documentConference.schemas.js";
import { paginationQuerySchema } from "./pagination.schemas.js";

export const ANTICIPATION_BATCH_STATUSES = ["pending_review"] as const;

export type AnticipationBatchStatus = (typeof ANTICIPATION_BATCH_STATUSES)[number];

// Mesmo teto da seleção de XML (~650 kB de ZIP em base64), dentro do 1 MB do gateway.
export const importAnticipationBatchBodySchema = z
  .object({
    client_id: z.string().uuid("Cliente inválido."),
    competence: competenceSchema,
    file_name: z.string().trim().min(1, "Informe o nome do arquivo.").max(255),
    zip_base64: z
      .string({ message: "Envie o ZIP." })
      .min(1, "Envie o ZIP.")
      .max(CONFERENCE_MAX_BASE64_LENGTH, "ZIP excede o limite de 650 kB.")
      .regex(/^[A-Za-z0-9+/]+={0,2}$/u, "ZIP em base64 inválido."),
  })
  .strict();

export const anticipationBatchIdParamsSchema = z
  .object({ id: z.string().uuid("Lote inválido.") })
  .strict();

export const listAnticipationBatchesQuerySchema = z
  .object({
    ...paginationQuerySchema.shape,
    client_id: z.string().uuid("Cliente inválido.").optional(),
    competence: competenceSchema.optional(),
  })
  .strict();

export type ImportAnticipationBatchBody = z.infer<typeof importAnticipationBatchBodySchema>;
export type ListAnticipationBatchesQuery = z.infer<typeof listAnticipationBatchesQuerySchema>;
