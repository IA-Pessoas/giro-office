import { z } from "zod";

import { competenceSchema } from "./competence.schemas.js";
import { paginationQuerySchema } from "./pagination.schemas.js";

const taxTypeSchema = z.enum(["ISS", "ICMS"]);
const rateSchema = z
  .string()
  .regex(/^\d{1,3}(?:[.,]\d{1,4})?$/, "Alíquota inválida.")
  .refine((value) => Number(value.replace(",", ".")) <= 100, "Alíquota deve ser até 100%.");

export const createFiscalRateBodySchema = z
  .object({
    client_id: z.string().uuid("Empresa inválida."),
    competence: competenceSchema,
    tax_type: taxTypeSchema,
    rate: rateSchema,
  })
  .strict();

export const listFiscalRatesQuerySchema = z
  .object({
    ...paginationQuerySchema.shape,
    client_id: z.string().uuid("Empresa inválida."),
    competence: competenceSchema.optional(),
    tax_type: taxTypeSchema.optional(),
  })
  .strict();

export const fiscalRateIdParamsSchema = z
  .object({ id: z.string().uuid("Registro inválido.") })
  .strict();
