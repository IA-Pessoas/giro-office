import { z } from "zod";

import {
  TRIAGE_CATALOG_CODE_MAX_LENGTH,
  TRIAGE_DOCUMENT_FIELDS,
  TRIAGE_DOCUMENT_NOTE_MAX_LENGTH,
  TRIAGE_DOCUMENT_STATUSES,
  TRIAGE_FISCAL_FIELDS,
} from "../services/triageDocumentsService.js";

const competenceSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "competence deve estar no formato YYYY-MM.");

const monthlyRequestShape = {
  client_id: z.string().uuid({ message: "client_id inválido." }),
  competence: competenceSchema,
  type: z.enum(["CONTABIL", "FISCAL"]).optional(),
};
const monthlyIdentityShape = {
  client_id: monthlyRequestShape.client_id,
  competence: monthlyRequestShape.competence,
};

export const triageMonthlyRequestSchema = z.object(monthlyRequestShape).strict();

export const fiscalTriagePortfolioQuerySchema = z.object({ competence: competenceSchema }).strict();

export const triageEditabilityRequestSchema = z
  .object({
    client_id: monthlyRequestShape.client_id,
    type: monthlyRequestShape.type,
  })
  .strict();

export const triageMonthlyIdParamsSchema = z
  .object({ id: z.string().uuid({ message: "id inválido." }) })
  .strict();

export const triageDocumentItemBodySchema = z
  .object({
    type: monthlyRequestShape.type,
    field: z.enum([...TRIAGE_DOCUMENT_FIELDS, ...TRIAGE_FISCAL_FIELDS] as [string, ...string[]]),
    status: z.enum(TRIAGE_DOCUMENT_STATUSES).optional(),
    value: z.string().trim().max(TRIAGE_DOCUMENT_NOTE_MAX_LENGTH).nullable().optional(),
    note: z.string().trim().max(TRIAGE_DOCUMENT_NOTE_MAX_LENGTH).nullable().optional(),
    justification: z.string().trim().max(TRIAGE_CATALOG_CODE_MAX_LENGTH).nullable().optional(),
    delivery_method: z
      .string()
      .trim()
      .min(1)
      .max(TRIAGE_CATALOG_CODE_MAX_LENGTH)
      .nullable()
      .optional(),
    state_site: z.string().trim().min(1).max(TRIAGE_CATALOG_CODE_MAX_LENGTH).nullable().optional(),
  })
  .strict()
  .superRefine((body, context) => {
    if (body.field === "billing_amount") {
      if (body.type !== "FISCAL" || body.value === undefined) {
        context.addIssue({
          code: "custom",
          path: ["value"],
          message: "billing_amount requer valor fiscal.",
        });
      }
      return;
    }
    if (body.status === undefined) {
      context.addIssue({ code: "custom", path: ["status"], message: "status é obrigatório." });
    }
    if (body.type === "CONTABIL" && body.delivery_method != null) {
      context.addIssue({
        code: "custom",
        path: ["delivery_method"],
        message: "método de entrega só é aceito na rotina fiscal.",
      });
    }
    if (body.type !== "FISCAL" && body.state_site != null) {
      context.addIssue({
        code: "custom",
        path: ["state_site"],
        message: "site estadual só é aceito na rotina fiscal.",
      });
    }
  });

export const triageDocumentsBulkBodySchema = z
  .object({ status: z.enum(TRIAGE_DOCUMENT_STATUSES), type: monthlyRequestShape.type })
  .strict();

export const triageStatementBodySchema = z
  .object({
    ...monthlyIdentityShape,
    bank_id: z.string().trim().min(1, "bank_id é obrigatório.").max(100),
    status: z.enum(TRIAGE_DOCUMENT_STATUSES),
  })
  .strict();

export const triageStatementArchiveBodySchema = z
  .object({
    ...monthlyIdentityShape,
    bank_id: z.string().trim().min(1, "bank_id é obrigatório.").max(100),
  })
  .strict();
