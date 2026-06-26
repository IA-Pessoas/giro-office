import { zIsoDate, zNonEmptyText } from "@workspace/shared";
import { z } from "zod";

const ncmIdSchema = z.string().uuid({ message: "ncm_id inválido." });

export const createNcmBodySchema = z
  .object({
    tax_regime: zNonEmptyText("tax_regime"),
    ncm_code: zNonEmptyText("ncm_code"),
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
    ncm_code: zNonEmptyText("ncm_code"),
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
    ncmCodes: z.preprocess(
      (v) => {
        if (Array.isArray(v)) return v;
        if (typeof v === "string") return v.split(",").filter(Boolean);
        return [];
      },
      z.array(z.string().min(1)).min(1, "ncmCodes é obrigatório."),
    ),
  })
  .strict();
