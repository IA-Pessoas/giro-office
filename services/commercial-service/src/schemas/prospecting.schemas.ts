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

const descriptionSchema = z.string().trim().max(5000).nullable().optional();
const statusDateSchema = z.coerce.date().nullable().optional();

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
    description: descriptionSchema,
  })
  .strict();

export const updateProspectingBodySchema = z
  .object({
    status: prospectingStatusSchema.optional(),
    status_date: statusDateSchema,
    description: descriptionSchema,
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message: "Informe ao menos um campo para atualizar.",
  });
