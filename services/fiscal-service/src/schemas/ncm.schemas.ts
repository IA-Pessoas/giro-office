import { zIsoDate, zNonEmptyText } from "@workspace/shared";
import { z } from "zod";

import { commaSeparatedListSchema, paginationQuerySchema } from "./pagination.schemas.js";

const ncmIdSchema = z.string().uuid({ message: "ncm_id inválido." });
const ncmCodeSchema = zNonEmptyText("ncm_code")
  .regex(/^\d+$/, { message: "ncm_code deve conter apenas números." })
  .length(8, { message: "ncm_code deve ter 8 dígitos." });

// Código legado de tb_fiscal.tributacao_pis_cofins.regime, o mesmo que a tela lê
// (app/src/modules/fiscal/utils/fiscalTaxRegime.ts). Nome conhecido vira código;
// outros valores seguem como vieram para não quebrar registros herdados.
const TAX_REGIME_CODE_BY_NAME: Record<string, string> = {
  "simples nacional": "0",
  "lucro presumido": "1",
  "lucro real": "2",
};
const taxRegimeSchema = zNonEmptyText("tax_regime").transform(
  (value) => TAX_REGIME_CODE_BY_NAME[value.toLowerCase()] ?? value,
);

function refineValidity(
  body: { validity_start_date: Date; validity_end_date?: Date },
  ctx: z.RefinementCtx,
) {
  if (body.validity_end_date && body.validity_end_date < body.validity_start_date) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["validity_end_date"],
      message: "validity_end_date não pode ser anterior a validity_start_date.",
    });
  }
}

export const createNcmBodySchema = z
  .object({
    tax_regime: taxRegimeSchema,
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
  .strict()
  .superRefine(refineValidity);

export const updateNcmBodySchema = z
  .object({
    ncm_id: ncmIdSchema,
    tax_regime: taxRegimeSchema,
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
  .strict()
  .superRefine(refineValidity);

export const detailNcmQuerySchema = z
  .object({
    ncm_id: ncmIdSchema,
  })
  .strict();

export const deleteNcmQuerySchema = detailNcmQuerySchema;

export const listNcmQuerySchema = z
  .object({
    ...paginationQuerySchema.shape,
    ncmCodes: commaSeparatedListSchema,
  })
  .strict();
