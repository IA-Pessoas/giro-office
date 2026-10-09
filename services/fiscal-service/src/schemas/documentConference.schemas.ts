import { z } from "zod";

// ponytail: 2 milhões de caracteres por planilha (~ dezenas de milhares de notas) cabem numa
// requisição JSON; arquivos maiores pedem upload em partes ou R2.
export const CONFERENCE_MAX_CONTENT_LENGTH = 2_000_000;

const conferenceSourceSchema = z
  .object({
    file_name: z.string().trim().min(1, "Informe o nome do arquivo.").max(255),
    content: z
      .string({ message: "Envie o conteúdo do arquivo." })
      .min(1, "Arquivo vazio.")
      .max(CONFERENCE_MAX_CONTENT_LENGTH, "Arquivo excede o limite de 2 milhões de caracteres."),
  })
  .strict();

export const documentConferenceBodySchema = z
  .object({
    dominio: conferenceSourceSchema,
    sefaz: conferenceSourceSchema,
  })
  .strict();
