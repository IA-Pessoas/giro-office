import { CLIENT_SEGMENT_TYPES } from "@workspace/shared/regularize";
import { z } from "zod";

export const clientSegmentIdParamsSchema = z
  .object({ id: z.string().uuid({ message: "id do segmento inválido." }) })
  .strict();

const segmentName = z
  .string()
  .trim()
  .min(1, { message: "Informe o nome do segmento." })
  .max(80, { message: "Nome do segmento deve ter até 80 caracteres." });
const segmentType = z.enum(CLIENT_SEGMENT_TYPES, {
  message: "Tipo do segmento deve ser serviço, comércio ou indústria.",
});

export const createClientSegmentBodySchema = z
  .object({ name: segmentName, type: segmentType })
  .strict();
export const updateClientSegmentBodySchema = z
  .object({ name: segmentName.optional(), type: segmentType.optional() })
  .strict()
  .refine((body) => body.name !== undefined || body.type !== undefined, {
    message: "Informe o nome ou o tipo do segmento.",
  });
