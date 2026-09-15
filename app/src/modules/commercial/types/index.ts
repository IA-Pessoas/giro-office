export interface CommercialSuccessEnvelope<T> {
  success: boolean;
  data: T;
}

export interface CommercialProposalConfig {
  id: string;
  name: string;
  contract_value: number;
}

export interface DeleteCommercialProposalConfigResult {
  id: string;
  deleted: true;
}

export interface CreateCommercialProposalConfigPayload {
  name: string;
  contract_value: number;
}

export type UpdateCommercialProposalConfigPayload = Partial<CreateCommercialProposalConfigPayload>;

export const COMMERCIAL_PROSPECTING_STATUSES = [
  "Análise Financeira",
  "Análise/Agendamento",
  "Envio de Proposta",
  "Paralisado",
  "Recusado pelo Cliente",
  "Fechado",
] as const;

export type CommercialProspectingStatus = (typeof COMMERCIAL_PROSPECTING_STATUSES)[number];

export interface CommercialProspectingClient {
  id: string;
  name: string;
  company_name: string | null;
  fantasy_name: string | null;
}

export interface CommercialProspecting {
  id: string;
  client_id: string;
  status: CommercialProspectingStatus;
  status_date: string | null;
  description: string | null;
  client: CommercialProspectingClient;
}

export interface CreateCommercialProspectingPayload {
  client_id: string;
  status: CommercialProspectingStatus;
  status_date?: string | null;
  description?: string | null;
}

export type UpdateCommercialProspectingPayload = Partial<
  Omit<CreateCommercialProspectingPayload, "client_id">
>;

export const COMMERCIAL_TASK_HIRING_STATUSES = [
  "A Realizar",
  "Contratado",
  "Não Contratado",
] as const;

export type CommercialTaskHiringStatus = (typeof COMMERCIAL_TASK_HIRING_STATUSES)[number];

export interface CommercialTaskBilling {
  id: string | null;
  task_id: string;
  task_name: string;
  task_status: string;
  billing: string;
  hiring_status: CommercialTaskHiringStatus | null;
  payment: string | null;
  billing_description: string | null;
}

export interface UpdateCommercialTaskBillingPayload {
  hiring_status: CommercialTaskHiringStatus;
  payment?: string | null;
  billing_description?: string | null;
}
