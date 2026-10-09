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

// 900 mil caracteres em base64 (~650 kB de ZIP) mais a lista de notas ficam dentro do 1 MB.
export const XML_SELECTION_MAX_BASE64_LENGTH = 900_000;

export const xmlSelectionBodySchema = z
  .object({
    file_name: z.string().trim().min(1, "Informe o nome do arquivo.").max(255),
    zip_base64: z
      .string({ message: "Envie o ZIP." })
      .min(1, "Envie o ZIP.")
      .max(XML_SELECTION_MAX_BASE64_LENGTH, "ZIP excede o limite de 650 kB.")
      .regex(/^[A-Za-z0-9+/]+={0,2}$/u, "ZIP em base64 inválido."),
    requests: z
      .array(z.string().trim().min(1).max(80, "Pedido longo demais."), {
        message: "Informe as notas.",
      })
      .min(1, "Informe ao menos uma nota.")
      .max(1000, "Limite de 1000 notas por seleção."),
  })
  .strict();

// Planilha e ZIP dividem o 1 MB do gateway: 300 mil caracteres + 600 mil em base64 (~450 kB).
export const SEFAZ_XML_MAX_CONTENT_LENGTH = 300_000;
export const SEFAZ_XML_MAX_BASE64_LENGTH = 600_000;

// Arquivo de texto (planilha ou SPED) + ZIP de XML: as duas partes da conferência contra XML.
const textFileSchema = (label: string) =>
  z
    .object({
      file_name: z.string().trim().min(1, "Informe o nome do arquivo.").max(255),
      content: z
        .string({ message: `Envie ${label}.` })
        .min(1, "Arquivo vazio.")
        .max(SEFAZ_XML_MAX_CONTENT_LENGTH, "Arquivo excede o limite de 300 mil caracteres."),
    })
    .strict();

const xmlZipSchema = z
  .object({
    file_name: z.string().trim().min(1, "Informe o nome do arquivo.").max(255),
    zip_base64: z
      .string({ message: "Envie o ZIP de XML." })
      .min(1, "Envie o ZIP de XML.")
      .max(SEFAZ_XML_MAX_BASE64_LENGTH, "ZIP excede o limite de 450 kB.")
      .regex(/^[A-Za-z0-9+/]+={0,2}$/u, "ZIP em base64 inválido."),
  })
  .strict();

export const sefazXmlConferenceBodySchema = z
  .object({ sefaz: textFileSchema("a planilha SEFAZ"), xml: xmlZipSchema })
  .strict();

export const spedConferenceBodySchema = z
  .object({ sped: textFileSchema("o arquivo SPED"), xml: xmlZipSchema })
  .strict();
