import { z } from "zod";

const clientIdSchema = z.string().uuid("Cliente inválido.");
const competenceSchema = z
  .string({ required_error: "Competência é obrigatória." })
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Competência deve estar no formato AAAA-MM.");
const urgencyCodeSchema = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
const requestIdSchema = z.string().uuid("Solicitação inválida.");
const descriptionSchema = z.string().trim().min(1).max(2000);

export const createTriageUrgentRequestBodySchema = z
  .object({
    client_id: clientIdSchema,
    competence: competenceSchema,
    urgency_code: urgencyCodeSchema,
    description: descriptionSchema,
    responsible_id: z.string().uuid("Responsável é obrigatório."),
  })
  .strict();

export const updateTriageUrgentRequestBodySchema = z
  .object({
    urgency_code: urgencyCodeSchema.optional(),
    description: descriptionSchema.optional(),
    responsible_id: z.string().uuid("Responsável inválido.").optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Informe ao menos um campo para atualizar.",
  });

export const closeTriageUrgentRequestBodySchema = z
  .object({ resolution_note: descriptionSchema })
  .strict();

export const listTriageUrgentRequestQuerySchema = z
  .object({
    client_id: clientIdSchema,
    competence: competenceSchema,
    status: z.enum(["OPEN", "CLOSED"]).optional(),
  })
  .strict();

export const triageUrgentRequestIdParamsSchema = z.object({ id: requestIdSchema }).strict();

export type CreateTriageUrgentRequestBody = z.infer<typeof createTriageUrgentRequestBodySchema>;
export type UpdateTriageUrgentRequestBody = z.infer<typeof updateTriageUrgentRequestBodySchema>;
export type CloseTriageUrgentRequestBody = z.infer<typeof closeTriageUrgentRequestBodySchema>;
