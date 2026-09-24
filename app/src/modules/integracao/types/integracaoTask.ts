export const INTEGRACAO_TASK_STATUS_VALUES = [
  "Em Andamento",
  "Paralisado",
  "Concluída",
  "Não Contratado",
  "A Realizar",
  "Em Espera",
  "Pendente",
  "PEC",
  "APEC",
] as const;

export type IntegracaoTaskStatus = (typeof INTEGRACAO_TASK_STATUS_VALUES)[number];

export const PROSPECTING_STATUS_VALUES = [
  "Análise Financeira",
  "Análise/Agendamento",
  "Envio de Proposta",
  "Paralisado",
  "Recusado pelo Cliente",
  "Fechado",
  "Baixada",
  "Inativo",
] as const;

export type ProspectingStatus = (typeof PROSPECTING_STATUS_VALUES)[number];

export type TaskBilling = "Realizar" | "Não Realizar";

export interface IntegracaoTaskListItem {
  id: string;
  isOwn: boolean;
  isUnassigned: boolean;
  name: string;
  status: string;
  billing: string;
  charge_comercial: boolean;
  hiring_status: string | null;
  payment: string | null;
  billing_description: string | null;
  charge_financeiro: boolean;
  client_name: string;
  project_name: string;
}

export interface IntegracaoTaskListResult {
  data: IntegracaoTaskListItem[];
  total: number;
  hasMore: boolean;
  summary: {
    inProgress: number;
    billable: number;
  };
}

export interface IntegracaoTaskDetail {
  id: string;
  model_id: string;
  project_id: string;
  client_id: string;
  name: string;
  status: string;
  department_id: string;
  observations: string | null;
  billing: string;
  hiring_status?: string | null;
  commercial_validation_pending?: boolean;
  urgency: string;
  responsible_id: string | null;
  responsible2_id: string | null;
  responsible3_id: string | null;
  start_date: string | null;
  prevision_date: string | null;
  end_date: string | null;
  date_created: string;
  date_updated: string;
  pending_approval?: boolean | null;
}

export type IntegracaoTaskCompletionDecision = "approved" | "refused";
export type IntegracaoTaskCompletionRequestStatus =
  | "pending"
  | "approved"
  | "refused"
  | "canceled";

export interface IntegracaoTaskCompletionRequest {
  id: string;
  requester_id: string;
  status: IntegracaoTaskCompletionRequestStatus;
  reason: string | null;
  decision_reason: string | null;
  decided_by: string | null;
  created_at: string;
  resolved_at: string | null;
}

export interface IntegracaoTaskAttachment {
  id: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  uploaded_by: string;
  created_at: string;
}

export interface IntegracaoTaskPostponement {
  id: string;
  previous_prevision_date: string;
  new_prevision_date: string;
  justification: string;
  author_id: string;
  author_name: string | null;
  created_at: string;
}

export interface IntegracaoTaskListParams {
  status?: string;
  ref?: string;
  ref_id?: string;
  search?: string;
  clientId?: string;
  assignment?: "assigned" | "unassigned";
  uniqueServiceReleased?: boolean;
  page?: number;
  limit?: number;
}

export interface CreateIntegracaoTaskBody {
  model_id: string;
  project_id: string;
  client_id: string;
  prospecting_status?: ProspectingStatus;
  name?: string;
  status?: IntegracaoTaskStatus;
  department_id: string;
  observations?: string;
  billing?: TaskBilling;
  urgency: string;
  responsible_id?: string | null;
  prevision_date?: string | null;
}

export interface UpdateIntegracaoTaskBody {
  task_id: string;
  model_id?: string;
  name?: string;
  status?: IntegracaoTaskStatus;
  department_id?: string;
  observations?: string;
  billing?: TaskBilling;
  urgency?: string;
  responsible_id?: string | null;
  prevision_date?: string;
}
