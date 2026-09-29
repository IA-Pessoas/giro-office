import { z } from "zod";

import { competenceSchema } from "./competence.schemas.js";
import { paginationQuerySchema } from "./pagination.schemas.js";

// Valor em reais com ponto decimal. Ausência de registro é receita zero no cálculo;
// um valor malformado ou negativo nunca vira zero silenciosamente.
const amountSchema = z
  .string({ required_error: "Informe a receita." })
  .regex(/^\d{1,13}(?:\.\d{1,2})?$/, "Receita inválida: use valor em reais, não negativo.");

export const createMonthlyRevenueBodySchema = z
  .object({
    client_id: z.string().uuid("Cliente inválido."),
    competence: competenceSchema,
    amount: amountSchema,
  })
  .strict();

export const updateMonthlyRevenueBodySchema = z.object({ amount: amountSchema }).strict();

export const monthlyRevenueIdParamsSchema = z
  .object({ id: z.string().uuid("Registro inválido.") })
  .strict();

export const listMonthlyRevenuesQuerySchema = z
  .object({
    ...paginationQuerySchema.shape,
    client_id: z.string().uuid("Cliente inválido."),
    from: competenceSchema.optional(),
    to: competenceSchema.optional(),
  })
  .strict()
  .refine((query) => !query.from || !query.to || query.from <= query.to, {
    message: "Período inválido.",
    path: ["from"],
  });
