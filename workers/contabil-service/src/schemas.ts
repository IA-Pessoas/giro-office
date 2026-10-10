import {
  TRIAGE_FISCAL_CHECKLIST_FIELDS,
  TRIAGE_FISCAL_SPECIAL_FIELDS,
  TRIAGE_PORTFOLIO_DOCUMENT_STATUSES,
  TRIAGE_PORTFOLIO_JUSTIFICATION_FILTERS,
  TRIAGE_PORTFOLIO_PRIORITY_FILTERS,
} from "@workspace/shared/triagem";
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
export const fiscalPortfolioSchema = z
  .object({
    competence,
    search: optionalText,
    responsible_id: optionalText,
    regime: optionalText,
    document_field: z
      .enum(TRIAGE_FISCAL_CHECKLIST_FIELDS, { message: "document_field inválido." })
      .optional(),
    document_status: z
      .enum(TRIAGE_PORTFOLIO_DOCUMENT_STATUSES, { message: "document_status inválido." })
      .optional(),
    justification: z
      .enum(TRIAGE_PORTFOLIO_JUSTIFICATION_FILTERS, {
        message: "justification deve ser with ou without.",
      })
      .optional(),
    priority: z
      .enum(TRIAGE_PORTFOLIO_PRIORITY_FILTERS, { message: "priority deve ser yes ou no." })
      .optional(),
    delivery_method: optionalText,
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
const dateOnly = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/u, "data deve estar no formato YYYY-MM-DD.")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
  }, "data inválida.");
export const monthlyUpdateSchema = z
  .object({
    type: monthlySchema.shape.type,
    triad_moviment: z.boolean().optional(),
    notes: z.string().trim().max(2_000).nullable().optional(),
    justification: z.string().trim().max(100).nullable().optional(),
    responsible_id: uuid("responsible_id").nullable().optional(),
    download_date: dateOnly.nullable().optional(),
    settlement_date: dateOnly.nullable().optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).some((key) => key !== "type"), {
    message: "Informe ao menos um campo do movimento mensal.",
  });
// Contábil configura o movimento padrão; Fiscal, os documentos especiais aplicáveis.
const configType = z.enum(["CONTABIL", "FISCAL"] as const).default("CONTABIL");
export const triageConfigQuerySchema = z
  .object({ client_id: uuid("client_id"), type: configType })
  .strict();
export const fiscalSettingsQuerySchema = z.object({ client_id: uuid("client_id") }).strict();
export const fiscalSettingsBodySchema = fiscalSettingsQuerySchema
  .extend({
    priority: z.boolean().optional(),
    delivery_method: z.string().trim().min(1).max(100).nullable().optional(),
  })
  .strict()
  .refine((body) => body.priority !== undefined || body.delivery_method !== undefined, {
    message: "Informe a prioridade ou o meio de envio.",
  });
export const triageConfigBodySchema = triageConfigQuerySchema
  .extend({ active_items: z.array(z.string()).max(documentFields.length) })
  .strict()
  .superRefine((body, context) => {
    // Fiscal só configura os documentos especiais; os demais itens seguem a rotina.
    const allowed: readonly string[] =
      body.type === "FISCAL" ? TRIAGE_FISCAL_SPECIAL_FIELDS : documentFields;
    for (const item of body.active_items)
      if (!allowed.includes(item))
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["active_items"],
          message: `Item ${item} não é configurável na rotina ${body.type === "FISCAL" ? "fiscal" : "contábil"}.`,
        });
  });
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
