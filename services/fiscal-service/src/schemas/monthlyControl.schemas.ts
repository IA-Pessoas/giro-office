import { z } from "zod";

import { competenceSchema } from "./competence.schemas.js";

export const MONTHLY_CONTROL_STATUSES = [
  "PENDING",
  "IN_PROGRESS",
  "AWAITING_CLIENT",
  "COMPLETED",
] as const;

export type MonthlyControlStatus = (typeof MONTHLY_CONTROL_STATUSES)[number];

const reasonSchema = z
  .string({ invalid_type_error: "Motivo inválido." })
  .trim()
  .min(3, "Informe o motivo com pelo menos 3 caracteres.")
  .max(500, "Motivo deve ter no máximo 500 caracteres.");

export const listMonthlyControlsQuerySchema = z.object({ competence: competenceSchema }).strict();

export const openMonthlyControlBodySchema = z
  .object({
    client_id: z.string().uuid("Cliente inválido."),
    competence: competenceSchema,
    reason: reasonSchema.optional(),
  })
  .strict();

export const monthlyControlIdParamsSchema = z
  .object({ id: z.string().uuid("Controle inválido.") })
  .strict();

export const updateMonthlyControlBodySchema = z
  .object({
    status: z.enum(MONTHLY_CONTROL_STATUSES, { message: "Situação inválida." }).optional(),
    no_movement: z.boolean({ invalid_type_error: "Sem movimento inválido." }).optional(),
    reason: reasonSchema.optional(),
  })
  .strict()
  .refine((body) => body.status !== undefined || body.no_movement !== undefined, {
    message: "Informe a situação ou a condição de movimento.",
    path: ["status"],
  });
