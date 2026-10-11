import { z } from "zod";

import { DTE_IMPORT_FORMATS, DTE_IMPORT_LIMITS } from "../services/dteImportParser.js";
import { DTE_NOTICE_READING_FILTERS } from "../services/dteNoticeService.js";
import { DTE_QUERY_IMPORT_LIMITS, DTE_QUERY_STATUSES } from "../services/dteQueryService.js";
import { isCalendarDay } from "./common.schemas.js";

export const importDteBodySchema = z
  .object({
    format: z.enum(DTE_IMPORT_FORMATS),
    content: z
      .string()
      .min(1, "content obrigatório.")
      .max(DTE_IMPORT_LIMITS.maxContentLength, "Conteúdo acima do tamanho máximo."),
  })
  .strict();

// Dia civil (aaaa-mm-dd) sempre enviado por quem consulta: o servidor não conhece o fuso.
function dteDaySchema(field: string) {
  return z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${field} deve estar no formato aaaa-mm-dd.`)
    .refine(isCalendarDay, `${field} não existe no calendário.`)
    .transform((value) => new Date(`${value}T00:00:00.000Z`));
}

export const listDteNoticesQuerySchema = z
  .object({
    from: dteDaySchema("from").optional(),
    to: dteDaySchema("to").optional(),
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

const dteQueryDateSchema = dteDaySchema("date");

const dteQueryListSchema = z
  .string()
  .max(DTE_QUERY_IMPORT_LIMITS.maxListLength, "Lista acima do tamanho máximo.");

export const dteQueryGridQuerySchema = z.object({ date: dteQueryDateSchema }).strict();

export const updateDteQueryStatusBodySchema = z
  .object({
    client_id: z.string().uuid("client_id inválido."),
    date: dteQueryDateSchema,
    status: z.enum(DTE_QUERY_STATUSES),
  })
  .strict();

export const importDteQueryListsBodySchema = z
  .object({
    date: dteQueryDateSchema,
    done: dteQueryListSchema,
    not_done: dteQueryListSchema,
  })
  .strict();

export const listDteImportsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
