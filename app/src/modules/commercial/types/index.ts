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
  "Baixada",
  "Fechado",
  "Inativo",
] as const;

export type CommercialProspectingStatus = (typeof COMMERCIAL_PROSPECTING_STATUSES)[number];

export interface CommercialProspectingClient {
  id: string;
  name: string;
  company_name: string | null;
  fantasy_name: string | null;
}

export interface CommercialProspectingListClient extends CommercialProspectingClient {
  cpf_cnpj: string;
  number: string | null;
  email: string | null;
  indication: string | null;
  partners: Array<{ clientPF: { name: string } }>;
}

export interface CommercialProspectingPage {
  items: CommercialProspectingListItem[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export interface CommercialProspectingFilters {
  page: number;
  page_size: number;
  status?: CommercialProspectingStatus;
  search?: string;
}

export interface CommercialProspecting {
  id: string;
  client_id: string;
  status: CommercialProspectingStatus;
  status_date: string | null;
  closed_at?: string | null;
  solution: "CASTELO" | "KALANGO" | "META" | "NIT" | null;
  reference_month: string | null;
  service: string | null;
  description: string | null;
  participants: string | null;
  meeting_mode: string | null;
  branch: string | null;
  reset_date?: string | null;
  reset_scheduled_by?: string | null;
  reset_scheduled_by_name?: string | null;
  reset_registered_at?: string | null;
  reset_processed_at?: string | null;
  pause_reason: string | null;
  attachment_name: string | null;
  attachment_mime_type: string | null;
  attachment_size_bytes: number | null;
  client: CommercialProspectingClient;
}

export interface CommercialProspectingListItem extends Omit<CommercialProspecting, "client"> {
  client: CommercialProspectingListClient;
}

export interface CommercialProspectingHistoryEntry {
  id: string;
  field: string;
  old_value: unknown;
  new_value: unknown;
  changed_by: string;
  changed_by_name?: string;
  created_at: string;
}

export interface ArchiveCommercialProspectingResult {
  id: string;
  deleted: true;
}

export interface CreateCommercialProspectingPayload {
  client_id: string;
  status: CommercialProspectingStatus;
  status_date: string;
  solution: "CASTELO" | "KALANGO" | "META" | "NIT";
  reference_month: string;
  service?: string | null;
  description?: string | null;
  participants?: string | null;
  meeting_mode?: string | null;
  branch?: string | null;
  pause_reason?: string | null;
}

export type UpdateCommercialProspectingPayload = Partial<
  Omit<CreateCommercialProspectingPayload, "client_id" | "status">
> & {
  status?: CommercialProspectingStatus | "Fechado SE";
  reset_date?: string | null;
};

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
