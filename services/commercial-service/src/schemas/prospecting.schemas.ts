import { z } from "zod";

export const prospectingStatuses = [
  "Análise Financeira",
  "Análise/Agendamento",
  "Envio de Proposta",
  "Paralisado",
  "Recusado pelo Cliente",
  "Fechado",
] as const;

export const prospectingStatusSchema = z.enum(prospectingStatuses);
export type ProspectingStatus = z.infer<typeof prospectingStatusSchema>;

export const prospectingSolutions = ["CASTELO", "KALANGO", "META", "NIT"] as const;
export const prospectingSolutionSchema = z.enum(prospectingSolutions);
export type ProspectingSolution = z.infer<typeof prospectingSolutionSchema>;

const descriptionSchema = z.string().trim().max(5000).nullable().optional();
const statusDateSchema = z.preprocess(
  (value) => (value === null || value === "" ? undefined : value),
  z.coerce.date(),
);
const optionalTextSchema = z.string().trim().max(1000).nullable().optional();
const referenceMonthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Mês inválido. Use AAAA-MM.");
const pauseReasonSchema = z.string().trim().min(1).max(1000).nullable().optional();

function requirePauseReason(
  data: { status?: ProspectingStatus; pause_reason?: string | null },
  context: z.RefinementCtx,
): void {
  if (data.status === "Paralisado" && !data.pause_reason?.trim()) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Informe o motivo da paralisação.",
      path: ["pause_reason"],
    });
  }
}

export const prospectingIdParamSchema = z
  .object({
    id: z.string().uuid("Id da prospecção inválido."),
  })
  .strict();

export const createProspectingBodySchema = z
  .object({
    client_id: z.string().uuid("Cliente inválido."),
    status: prospectingStatusSchema,
    status_date: statusDateSchema,
    solution: prospectingSolutionSchema,
    reference_month: referenceMonthSchema,
    service: optionalTextSchema,
    description: descriptionSchema,
    participants: optionalTextSchema,
    meeting_mode: optionalTextSchema,
    branch: optionalTextSchema,
    pause_reason: pauseReasonSchema,
  })
  .strict()
  .superRefine(requirePauseReason);

export const updateProspectingBodySchema = z
  .object({
    status: prospectingStatusSchema.optional(),
    status_date: statusDateSchema.optional(),
    solution: prospectingSolutionSchema.optional(),
    reference_month: referenceMonthSchema.optional(),
    service: optionalTextSchema,
    description: descriptionSchema,
    participants: optionalTextSchema,
    meeting_mode: optionalTextSchema,
    branch: optionalTextSchema,
    pause_reason: pauseReasonSchema,
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message: "Informe ao menos um campo para atualizar.",
  })
  .superRefine(requirePauseReason);
