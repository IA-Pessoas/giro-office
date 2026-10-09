import { z } from "zod";

import { FISCAL_OBLIGATION_CODES } from "../services/fiscalObligationCatalog.js";
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

const obligationCodeSchema = z.enum(FISCAL_OBLIGATION_CODES, { message: "Obrigação inválida." });

export const monthlyObligationParamsSchema = z
  .object({ id: z.string().uuid("Controle inválido."), code: obligationCodeSchema })
  .strict();

export const addMonthlyObligationBodySchema = z
  .object({ code: obligationCodeSchema, reason: reasonSchema.optional() })
  .strict();

/**
 * AAAA-MM-DD de calendário real (recusa 2026-02-31). Não usa `zIsoDate` do shared porque
 * ele transforma em Date e aceita dia inexistente; aqui o serviço precisa da string.
 */
const isoDateSchema = z.string().refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}, "Data inválida.");

export const updateMonthlyObligationBodySchema = z
  .object({
    applicable: z.boolean({ invalid_type_error: "Aplicabilidade inválida." }).optional(),
    completed_on: isoDateSchema.nullable().optional(),
    protocol: z.string().trim().max(200, "Protocolo deve ter no máximo 200 caracteres.").optional(),
    reason: reasonSchema.optional(),
  })
  .strict()
  .refine((body) => body.applicable !== undefined || body.completed_on !== undefined, {
    message: "Informe a aplicabilidade ou o cumprimento.",
    path: ["applicable"],
  });
