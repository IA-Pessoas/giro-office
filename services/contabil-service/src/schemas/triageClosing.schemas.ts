import { z } from "zod";

import { TRIAGE_CLOSING_STATUSES } from "../services/triageClosingService.js";

const competenceSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "competence deve estar no formato YYYY-MM.");

export const triageClosingQuerySchema = z
  .object({
    client_id: z.string().uuid({ message: "client_id inválido." }),
    competence: competenceSchema,
  })
  .strict();

export const triageClosingUpdateBodySchema = triageClosingQuerySchema
  .extend({
    status: z.enum(TRIAGE_CLOSING_STATUSES, {
      message: "status de fechamento inválido.",
    }),
  })
  .strict();
