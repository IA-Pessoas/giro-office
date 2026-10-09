import { z } from "zod";

import { FISCAL_ANNUAL_DECLARATION_CODES } from "../services/fiscalAnnualCatalog.js";
import {
  addMonthlyObligationBodySchema,
  updateMonthlyObligationBodySchema,
} from "./monthlyControl.schemas.js";

export const listAnnualControlsQuerySchema = z
  .object({
    year: z.coerce
      .number({ invalid_type_error: "Ano inválido." })
      .int("Ano inválido.")
      .min(2000, "Ano inválido.")
      .max(2100, "Ano inválido."),
  })
  .strict();

const declarationCodeSchema = z.enum(FISCAL_ANNUAL_DECLARATION_CODES, {
  message: "Declaração inválida.",
});

export const annualControlIdParamsSchema = z
  .object({ id: z.string().uuid("Controle inválido.") })
  .strict();

export const annualDeclarationParamsSchema = z
  .object({ id: z.string().uuid("Controle inválido."), code: declarationCodeSchema })
  .strict();

/** Mesmo contrato da inclusão mensal, com os códigos do catálogo anual. */
export const addAnnualDeclarationBodySchema = addMonthlyObligationBodySchema.extend({
  code: declarationCodeSchema,
});

/** Mesmas regras de aplicabilidade e cumprimento do mensal. */
export const updateAnnualDeclarationBodySchema = updateMonthlyObligationBodySchema;
