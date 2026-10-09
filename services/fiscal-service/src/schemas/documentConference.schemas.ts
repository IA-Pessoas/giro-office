import { z } from "zod";

// ponytail: as duas planilhas viajam num JSON que o gateway limita a 1 MB; 450 mil caracteres
// por arquivo (alguns milhares de notas) cabem com folga. Mais que isso pede upload em partes/R2.
export const CONFERENCE_MAX_CONTENT_LENGTH = 450_000;

const conferenceSourceSchema = z
  .object({
    file_name: z.string().trim().min(1, "Informe o nome do arquivo.").max(255),
    content: z
      .string({ message: "Envie o conteúdo do arquivo." })
      .min(1, "Arquivo vazio.")
      .max(CONFERENCE_MAX_CONTENT_LENGTH, "Arquivo excede o limite de 450 mil caracteres."),
  })
  .strict();

export const documentConferenceBodySchema = z
  .object({
    dominio: conferenceSourceSchema,
    sefaz: conferenceSourceSchema,
  })
  .strict();
