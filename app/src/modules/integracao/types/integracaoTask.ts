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
  name: string;
  status: string;
  billing: string;
  charge_comercial: boolean;
  hiring_status: string | null;
  payment: string | null;
  billing_description: string | null;
  charge_financeiro: boolean;
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
  urgency: string;
  responsible_id: string;
  responsible2_id: string | null;
  responsible3_id: string | null;
  start_date: string | null;
  prevision_date: string | null;
  end_date: string | null;
  date_created: string;
  date_updated: string;
}

export interface IntegracaoTaskListParams {
  status?: string;
  ref?: string;
  ref_id?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface CreateIntegracaoTaskBody {
  model_id: string;
  project_id: string;
  client_id: string;
  prospecting_status: ProspectingStatus;
  name?: string;
  status?: IntegracaoTaskStatus;
  department_id?: string;
  observations?: string;
  billing?: TaskBilling;
  urgency: string;
  responsible_id?: string;
  responsible2_id?: string | null;
  responsible3_id?: string | null;
  prevision_date?: string | null;
}

export interface UpdateIntegracaoTaskBody {
  task_id: string;
  name?: string;
  status?: IntegracaoTaskStatus;
  department_id?: string;
  observations?: string;
  billing?: TaskBilling;
  urgency?: string;
  responsible_id?: string;
  responsible2_id?: string | null;
  responsible3_id?: string | null;
  prevision_date?: string | null;
}
