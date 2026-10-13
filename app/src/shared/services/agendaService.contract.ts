export const AGENDA_ENDPOINT = "/task/agenda";

export const AGENDA_STATUSES = ["Pendente", "Realizado", "Cancelado"] as const;
export type AgendaStatus = (typeof AGENDA_STATUSES)[number];
export const INTEGRACAO_AGENDA_STATUSES = [
  "Realizado",
  "Agendada",
  "Atrasada",
  "Desmarcada pelo cliente",
  "Pendente",
  "Previsão",
] as const;
export type IntegracaoAgendaStatus = (typeof INTEGRACAO_AGENDA_STATUSES)[number];
export interface IntegracaoAgendaParticipant {
  department_id: string;
  participant_id: string;
}

/** Módulo cujo departamento filtra a agenda compartilhada. */
export type AgendaModule = "contabil" | "pessoal" | "triagem" | "regularize" | "integracao";

export interface AgendaEvent {
  id: string;
  agenda: string;
  date: string;
  // Registros legados podem ter estado fora da lista ou vazio.
  status: string | null;
  obs: string | null;
  location: string | null;
  department_control_id: string;
  department_id_2: string | null;
  department_id_3: string | null;
  department_id_4: string | null;
  client: { id: string; name: string } | null;
  /** Responsável pelo evento; sem ele, o evento entra na "minha agenda" de todos. */
  participant: { id: string; name: string } | null;
  participant2: { id: string; name: string } | null;
  participant3: { id: string; name: string } | null;
  participant4: { id: string; name: string } | null;
  /** Preenchido quando o evento é ocorrência de uma recorrência mensal. */
  recurring_agenda_id: string | null;
}

export interface AgendaEventPayload {
  agenda: string;
  date: string;
  status: AgendaStatus | IntegracaoAgendaStatus;
  obs: string | null;
  location?: string | null;
  /** Repete todo mês; desligar encerra a série e mantém os eventos já criados. */
  recurrent?: boolean;
  /** Nulo limpa o vínculo; ausente não mexe nele. */
  client_id?: string | null;
  participant_id?: string | null;
  participants?: IntegracaoAgendaParticipant[];
}

/** Evento de dia inteiro: meio-dia UTC mantém o dia escolhido em qualquer fuso do Brasil. */
export function agendaDateToIso(day: string): string {
  return `${day}T12:00:00.000Z`;
}

export function agendaDay(isoDate: string): string {
  return isoDate.slice(0, 10);
}
