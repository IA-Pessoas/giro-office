import { z } from "zod";

export const createIntegrationBodySchema = z
  .object({
    organization_id: z.string().uuid({ message: "organization_id inválido." }).optional(),
    type: z.string().min(1),
    name: z.string().min(1),
    company_name: z.string().nullable().optional(),
    fantasy_name: z.string().nullable().optional(),
    cpf_cnpj: z.string().min(1),
    opening_date: z.coerce.date().nullable().optional(),
    responsible: z.string().nullable().optional(),
    cpf_responsible: z.string().nullable().optional(),
    number: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    agent: z.string().nullable().optional(),
    cpf_agent: z.string().nullable().optional(),
    instagram: z.string().nullable().optional(),
    indication: z.string().nullable().optional(),
    participants_meet: z.string().nullable().optional(),
    meet_type: z.string().nullable().optional(),
    type_registration: z.string().optional().default("Novo"),
    service_unique: z.boolean().optional().default(false),
  })
  .strict();

export const cnpjLookupQuerySchema = z
  .object({
    cnpj: z.string().min(1).max(32),
  })
  .strict();

export const updateIntegrationBodySchema = z
  .object({
    type: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
    company_name: z.string().nullable().optional(),
    fantasy_name: z.string().nullable().optional(),
    cpf_cnpj: z.string().min(1).optional(),
    responsible: z.string().nullable().optional(),
    cpf_responsible: z.string().nullable().optional(),
    agent: z.string().nullable().optional(),
    cpf_agent: z.string().nullable().optional(),
    number: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    address: z.string().nullable().optional(),
    cep: z.string().nullable().optional(),
    neighborhood: z.string().nullable().optional(),
    state: z.string().nullable().optional(),
    city: z.string().nullable().optional(),
    instagram: z.string().nullable().optional(),
    indication: z.string().nullable().optional(),
    type_registration: z.string().optional(),
    service_unique: z.boolean().optional(),
  })
  .strict()
  .refine((d) => Object.keys(d).length > 0, "Informe ao menos um campo para atualizar.");

export const terminationBodySchema = z
  .object({
    reason: z.string().min(1),
    description: z.string().min(1),
    /** Competência no formato YYYY-MM (ex.: 2026-03). */
    competence_output: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "competence_output deve estar no formato YYYY-MM."),
  })
  .strict();

export const updateFinanceBodySchema = z
  .object({
    contract: z.boolean(),
  })
  .strict();

export const updateRegularizeBodySchema = z
  .object({
    dominio_code: z.string().nullable().optional(),
    name: z.string().min(1).optional(),
    company_name: z.string().nullable().optional(),
    fantasy_name: z.string().nullable().optional(),
    cpf_cnpj: z.string().min(1).optional(),
    cnae: z.string().nullable().optional(),
    cnae_secondary: z.string().nullable().optional(),
    responsible: z.string().nullable().optional(),
    cpf_responsible: z.string().nullable().optional(),
    number: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    address: z.string().nullable().optional(),
    cep: z.string().nullable().optional(),
    neighborhood: z.string().nullable().optional(),
    state: z.string().nullable().optional(),
    city: z.string().nullable().optional(),
    customer_since: z.coerce.date().nullable().optional(),
    municipal_registration: z.string().nullable().optional(),
    state_registration: z.string().nullable().optional(),
    commercial_board_registration: z.string().nullable().optional(),
    opening_date: z.coerce.date().nullable().optional(),
    regime: z.string().nullable().optional(),
    size: z.string().nullable().optional(),
    segment: z.string().nullable().optional(),
    contabil: z.boolean().optional(),
    fiscal: z.boolean().optional(),
    pessoal: z.boolean().optional(),
    infoproduto: z.boolean().optional(),
    consultoria: z.boolean().optional(),
    start_strike: z.coerce.date().nullable().optional(),
    end_strike: z.coerce.date().nullable().optional(),
    deletion_date: z.coerce.date().nullable().optional(),
  })
  .strict()
  .refine((d) => Object.keys(d).length > 0, "Informe ao menos um campo para atualizar.");

// Valor monetário em texto: "R$ 1.234,56", "1234,56", "1500" ou "1234.56" (espelha app/.../utils/paForm.ts).
const moneyTextSchema = z
  .string()
  .regex(
    /^(R\$\s?)?((\d{1,3}(\.\d{3})+|\d+)(,\d{1,2})?|\d+\.\d{1,2})$/,
    "Informe um valor numérico (ex.: R$ 1.234,56).",
  )
  .nullable()
  .optional();

export const createClientPABodySchema = z.object({}).strict();

export const updateClientPABodySchema = z
  .object({
    activities: z.string().nullable().optional(),
    tax_billing: moneyTextSchema,
    management_billing: moneyTextSchema,
    works_bidding: z.boolean().nullable().optional(),
    dissatisfaction: z.string().nullable().optional(),
    registered_collabortors: z.number().int().nullable().optional(),
    unregistered_collabortors: z.number().int().nullable().optional(),
    esocial: z.boolean().nullable().optional(),
    how_many_banks: z.boolean().nullable().optional(),
    whitch_banks: z.string().nullable().optional(),
    responsible_departments: z.string().nullable().optional(),
    works_system: z.boolean().nullable().optional(),
    system_name: z.string().nullable().optional(),
    system_usage_time: z.string().nullable().optional(),
    system_value: moneyTextSchema,
    system_contact: z.string().nullable().optional(),
    system_operations: z.string().nullable().optional(),
    cloud_storage: z.boolean().nullable().optional(),
    which_cloud_storage: z.string().nullable().optional(),
    rental_agreement: z.boolean().nullable().optional(),
    assessment_regime: z.string().nullable().optional(),
    permit: z.string().nullable().optional(),
    services: z.string().nullable().optional(),
  })
  .strict()
  .refine((d) => Object.keys(d).length > 0, "Informe ao menos um campo para atualizar.");

const HISTORY_DATE_MESSAGE = "Informe data e hora com fuso horário (ISO 8601).";

const historyFields = {
  // Sem offset o backend gravaria a hora local como UTC e cada edição deslocaria o horário.
  date: z
    .string({ required_error: HISTORY_DATE_MESSAGE })
    .datetime({ offset: true, message: HISTORY_DATE_MESSAGE })
    .transform((value) => new Date(value)),
  history: z
    .string({ required_error: "Informe o texto do histórico." })
    .trim()
    .min(1, "Informe o texto do histórico."),
};
const HISTORY_UNKNOWN_FIELD_MESSAGE = "Campo não permitido no histórico.";

// O anexo `file` chega fora do corpo validado (multer no Node, removido antes do parse no Worker).
export const createHistoryBodySchema = z
  .object({
    ...historyFields,
    pending_id: z.string().uuid("Pendência inválida.").optional(),
  })
  .strict(HISTORY_UNKNOWN_FIELD_MESSAGE);

export const updateHistoryBodySchema = z
  .object(historyFields)
  .strict(HISTORY_UNKNOWN_FIELD_MESSAGE);

export const createHistoryPendingBodySchema = z
  .object({
    reason: z
      .string({ required_error: "Informe o motivo da pendência." })
      .trim()
      .min(1, "Informe o motivo da pendência."),
  })
  .strict(HISTORY_UNKNOWN_FIELD_MESSAGE);

export const historyIdParamsSchema = z
  .object({
    id: z.string().uuid("Cliente inválido."),
    historyId: z.string().uuid("Histórico inválido."),
  })
  .strict();

export const pendingListQuerySchema = z
  .object({
    user_id: z.string().uuid("Usuário inválido.").optional(),
  })
  .strict("Filtro não permitido.");

export const pendingDeleteParamsSchema = z
  .object({
    pendingId: z.string().uuid("Pendência inválida."),
  })
  .strict();

export type CreateIntegrationBody = z.infer<typeof createIntegrationBodySchema>;
export type UpdateIntegrationBody = z.infer<typeof updateIntegrationBodySchema>;
export type TerminationBody = z.infer<typeof terminationBodySchema>;
export type UpdateFinanceBody = z.infer<typeof updateFinanceBodySchema>;
export type UpdateRegularizeBody = z.infer<typeof updateRegularizeBodySchema>;
export type CreateClientPABody = z.infer<typeof createClientPABodySchema>;
export type UpdateClientPABody = z.infer<typeof updateClientPABodySchema>;
