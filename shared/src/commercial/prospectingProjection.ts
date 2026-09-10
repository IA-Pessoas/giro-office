export const COMMERCIAL_PROSPECTING_TRANSITION_EVENT = "commercial.prospecting.transition" as const;

export const COMMERCIAL_PROSPECTING_EVENT_VERSION = 1 as const;

export type CommercialProspectingProjectionStatus =
  | "Análise Financeira"
  | "Análise/Agendamento"
  | "Envio de Proposta"
  | "Paralisado"
  | "Recusado pelo Cliente"
  | "Fechado";

export interface CommercialProspectingTransitionEvent {
  event_id: string;
  event_type: typeof COMMERCIAL_PROSPECTING_TRANSITION_EVENT;
  event_version: typeof COMMERCIAL_PROSPECTING_EVENT_VERSION;
  organization_id: string;
  client_id: string;
  prospecting_id: string;
  from_status: CommercialProspectingProjectionStatus | null;
  to_status: CommercialProspectingProjectionStatus;
  status_date: string | null;
  description: string | null;
  audit_correlation_id: string;
  occurred_at: string;
}

export interface CommercialProspectingProjectionResult {
  event_id: string;
  applied: boolean;
  duplicate: boolean;
  client_id: string;
}
