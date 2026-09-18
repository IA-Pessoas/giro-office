import { z } from "zod";

import {
  TRIAGE_DOCUMENT_FIELDS,
  TRIAGE_DOCUMENT_STATUSES,
} from "../services/triageDocumentsService.js";

const competenceSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "competence deve estar no formato YYYY-MM.");

const monthlyRequestShape = {
  client_id: z.string().uuid({ message: "client_id inválido." }),
  competence: competenceSchema,
};

export const triageMonthlyRequestSchema = z.object(monthlyRequestShape).strict();

export const triageEditabilityRequestSchema = z
  .object({ client_id: monthlyRequestShape.client_id })
  .strict();

export const triageMonthlyIdParamsSchema = z
  .object({ id: z.string().uuid({ message: "id inválido." }) })
  .strict();

export const triageDocumentItemBodySchema = z
  .object({
    field: z.enum(TRIAGE_DOCUMENT_FIELDS),
    status: z.enum(TRIAGE_DOCUMENT_STATUSES),
  })
  .strict();

export const triageDocumentsBulkBodySchema = z
  .object({ status: z.enum(TRIAGE_DOCUMENT_STATUSES) })
  .strict();

export const triageStatementBodySchema = z
  .object({
    ...monthlyRequestShape,
    bank_id: z.string().trim().min(1, "bank_id é obrigatório.").max(100),
    status: z.enum(TRIAGE_DOCUMENT_STATUSES),
  })
  .strict();
