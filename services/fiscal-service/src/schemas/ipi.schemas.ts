import { zNonEmptyText } from "@workspace/shared";
import { z } from "zod";

import { commaSeparatedListSchema, paginationQuerySchema } from "./pagination.schemas.js";

const ipiIdSchema = z.string().uuid({ message: "ipi_id inválido." });

export const createIpiBodySchema = z
  .object({
    ncm: zNonEmptyText("ncm"),
    ex: z.string().optional(),
    description: z.string().optional(),
    aliquot: z.string().optional(),
  })
  .strict();

export const updateIpiBodySchema = z
  .object({
    ipi_id: ipiIdSchema,
    ncm: zNonEmptyText("ncm"),
    ex: z.string().optional(),
    description: z.string().optional(),
    aliquot: z.string().optional(),
  })
  .strict();

export const detailIpiQuerySchema = z
  .object({
    ipi_id: ipiIdSchema,
  })
  .strict();

export const listIpiQuerySchema = z
  .object({
    ...paginationQuerySchema.shape,
    ipiCodes: commaSeparatedListSchema,
  })
  .strict();
