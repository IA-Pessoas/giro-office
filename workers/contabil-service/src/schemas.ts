import { z } from "zod";

const competence = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/u, "competence deve estar no formato YYYY-MM.");
const uuid = (name: string) => z.string().uuid({ message: `${name} inválido.` });

export const closingQuerySchema = z.object({ client_id: uuid("client_id"), competence }).strict();
export const closingUpdateSchema = closingQuerySchema
  .extend({
    status: z.enum(["NOT_RECEIVED", "RECEIVED", "UNDER_REVIEW", "CLOSED", "REOPENED"] as const, {
      message: "status de fechamento inválido.",
    }),
  })
  .strict();

const documentFields = [
  "financial_transactions",
  "triaged_transactions",
  "inventory_control",
  "accounts_payable_report",
  "accounts_receivable_report",
  "card_statements",
  "loan_agreements",
  "bank_reconciliation",
  "bank_investments",
  "card_sales_report",
] as const;
const fiscalChecklistFields = [
  "inbound_report",
  "outbound_report",
  "nfse_provided",
  "nfse_received",
  "cte_documents",
  "mei_documents",
  "nfce_documents",
  "sped_fiscal",
  "sped_contributions",
  "nfce_received",
  "model_21_invoice",
  "cte_as_issuer",
  "services_provided_as_mei",
] as const;
export const triageDocumentFields = documentFields;
export const triageFiscalFields = [...fiscalChecklistFields, "billing_amount"] as const;
export const triageDocumentStatuses = [
  "PENDING",
  "COMPLETED",
  "ATTENTION",
  "UNDER_REVIEW",
  "NOT_PRESENT",
  "NOT_APPLICABLE",
] as const;

export const monthlySchema = z
  .object({
    client_id: uuid("client_id"),
    competence,
    type: z.enum(["CONTABIL", "FISCAL"] as const).optional(),
  })
  .strict();
const optionalText = z.string().max(200).optional();
// Valores semânticos (campo, status, justificativa) são validados por parseFiscalTriagePortfolioFilters.
export const fiscalPortfolioSchema = z
  .object({
    competence,
    search: optionalText,
    responsible_id: optionalText,
    regime: optionalText,
    document_field: optionalText,
    document_status: optionalText,
    justification: optionalText,
  })
  .strict();
export const contabilPortfolioSchema = z
  .object({
    competence,
    responsible_id: optionalText,
    regime: optionalText,
    status: closingUpdateSchema.shape.status.optional(),
  })
  .strict();
export const editabilitySchema = z
  .object({ client_id: uuid("client_id"), type: monthlySchema.shape.type })
  .strict();
export const monthlyIdSchema = z.object({ id: uuid("id") }).strict();
export const documentItemSchema = z
  .object({
    type: monthlySchema.shape.type,
    field: z.enum([...documentFields, ...triageFiscalFields] as [string, ...string[]]),
    status: z.enum(triageDocumentStatuses).optional(),
    value: z.string().trim().max(2_000).nullable().optional(),
    note: z.string().trim().max(2_000).nullable().optional(),
    justification: z.string().trim().max(100).nullable().optional(),
    delivery_method: z.string().trim().min(1).max(100).nullable().optional(),
    state_site: z.string().trim().min(1).max(100).nullable().optional(),
  })
  .strict()
  .superRefine((body, ctx) => {
    if (body.field === "billing_amount") {
      if (body.type !== "FISCAL" || body.value === undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["value"],
          message: "billing_amount requer valor fiscal.",
        });
      }
      return;
    }
    if (body.status === undefined) {
      ctx.addIssue({ code: "custom", path: ["status"], message: "status é obrigatório." });
    }
    if (body.type === "CONTABIL" && body.delivery_method != null) {
      ctx.addIssue({
        code: "custom",
        path: ["delivery_method"],
        message: "método de entrega só é aceito na rotina fiscal.",
      });
    }
    if (body.type !== "FISCAL" && body.state_site != null) {
      ctx.addIssue({
        code: "custom",
        path: ["state_site"],
        message: "site estadual só é aceito na rotina fiscal.",
      });
    }
  });
export const documentsBulkSchema = z
  .object({ status: z.enum(triageDocumentStatuses), type: monthlySchema.shape.type })
  .strict();
export const statementSchema = z
  .object({
    client_id: uuid("client_id"),
    competence,
    bank_id: z.string().trim().min(1, "bank_id é obrigatório.").max(100),
    status: z.enum(triageDocumentStatuses),
  })
  .strict();
export const statementArchiveSchema = z
  .object({
    client_id: uuid("client_id"),
    competence,
    bank_id: z.string().trim().min(1, "bank_id é obrigatório.").max(100),
  })
  .strict();

export type TriageDocumentStatus = (typeof triageDocumentStatuses)[number];
