import { zIsoDate, zNonEmptyText } from "@workspace/shared";
import { z } from "zod";

import { commaSeparatedListSchema, paginationQuerySchema } from "./pagination.schemas.js";

const ncmIdSchema = z.string().uuid({ message: "ncm_id inválido." });
const ncmCodeSchema = zNonEmptyText("ncm_code").regex(/^\d+$/, {
  message: "ncm_code deve conter apenas números.",
});

export const createNcmBodySchema = z
  .object({
    tax_regime: zNonEmptyText("tax_regime"),
    ncm_code: ncmCodeSchema,
    federal_taxation_type: zNonEmptyText("federal_taxation_type"),
    description: zNonEmptyText("description"),
    ncm_notes: z.string().optional(),
    cst_pis_outgoing: z.string().optional(),
    cst_cofins_outgoing: z.string().optional(),
    product_group: z.string().optional(),
    validity_start_date: zIsoDate("validity_start_date"),
    information_source: z.string().optional(),
    reference_legislation: z.string().optional(),
    validity_end_date: zIsoDate("validity_end_date").optional(),
  })
  .strict();

export const updateNcmBodySchema = z
  .object({
    ncm_id: ncmIdSchema,
    tax_regime: zNonEmptyText("tax_regime"),
    ncm_code: ncmCodeSchema,
    federal_taxation_type: zNonEmptyText("federal_taxation_type"),
    description: zNonEmptyText("description"),
    ncm_notes: z.string().optional(),
    cst_pis_outgoing: z.string().optional(),
    cst_cofins_outgoing: z.string().optional(),
    product_group: z.string().optional(),
    validity_start_date: zIsoDate("validity_start_date"),
    information_source: z.string().optional(),
    reference_legislation: z.string().optional(),
    validity_end_date: zIsoDate("validity_end_date").optional(),
  })
  .strict();

export const detailNcmQuerySchema = z
  .object({
    ncm_id: ncmIdSchema,
  })
  .strict();

export const listNcmQuerySchema = z
  .object({
    ...paginationQuerySchema.shape,
    ncmCodes: commaSeparatedListSchema,
  })
  .strict();
