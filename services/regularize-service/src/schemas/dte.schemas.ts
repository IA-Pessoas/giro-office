import { z } from "zod";

import { DTE_IMPORT_FORMATS, DTE_IMPORT_LIMITS } from "../services/dteImportParser.js";
import { DTE_NOTICE_READING_FILTERS } from "../services/dteNoticeService.js";

export const importDteBodySchema = z
  .object({
    format: z.enum(DTE_IMPORT_FORMATS),
    content: z
      .string()
      .min(1, "content obrigatório.")
      .max(DTE_IMPORT_LIMITS.maxContentLength, "Conteúdo acima do tamanho máximo."),
  })
  .strict();

export const listDteNoticesQuerySchema = z
  .object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    tipo: z.string().max(100).optional(),
    search: z.string().trim().max(200).default(""),
    reading: z.enum(DTE_NOTICE_READING_FILTERS).default("Todos"),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export const updateDteNoticeReadingBodySchema = z
  .object({
    id: z.string().uuid("id inválido."),
    pending_reading: z.boolean(),
  })
  .strict();

export const listDteImportsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
