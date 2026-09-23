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

export const createClientPABodySchema = z.object({}).strict();

export const updateClientPABodySchema = z
  .object({
    activities: z.string().nullable().optional(),
    tax_billing: z.string().nullable().optional(),
    management_billing: z.string().nullable().optional(),
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
    system_value: z.string().nullable().optional(),
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

export const createHistoryBodySchema = z
  .object({
    date: z.coerce.date(),
    history: z.string().min(1),
    pending_id: z.string().uuid().optional(),
  })
  .strict();

export const updateHistoryBodySchema = z
  .object({
    date: z.coerce.date(),
    history: z.string().min(1),
  })
  .strict();

export const createHistoryPendingBodySchema = z
  .object({
    reason: z.string().min(1),
  })
  .strict();

export const historyIdParamsSchema = z
  .object({
    id: z.string().uuid(),
    historyId: z.string().uuid(),
  })
  .strict();

export const pendingListQuerySchema = z
  .object({
    user_id: z.string().uuid().optional(),
  })
  .strict();

export const pendingDeleteParamsSchema = z
  .object({
    pendingId: z.string().uuid(),
  })
  .strict();

export type CreateIntegrationBody = z.infer<typeof createIntegrationBodySchema>;
export type UpdateIntegrationBody = z.infer<typeof updateIntegrationBodySchema>;
export type TerminationBody = z.infer<typeof terminationBodySchema>;
export type UpdateFinanceBody = z.infer<typeof updateFinanceBodySchema>;
export type UpdateRegularizeBody = z.infer<typeof updateRegularizeBodySchema>;
export type CreateClientPABody = z.infer<typeof createClientPABodySchema>;
export type UpdateClientPABody = z.infer<typeof updateClientPABodySchema>;
