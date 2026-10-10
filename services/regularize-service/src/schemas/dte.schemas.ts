import { z } from "zod";

import { DTE_IMPORT_LIMITS } from "../services/dteImportParser.js";

export const importDteBodySchema = z
  .object({
    format: z.enum(["html", "json"]),
    content: z
      .string()
      .min(1, "content obrigatório.")
      .max(DTE_IMPORT_LIMITS.maxContentLength, "Conteúdo acima do tamanho máximo."),
  })
  .strict();

export const listDteImportsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
