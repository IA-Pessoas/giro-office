export const AGENDA_ENDPOINT = "/task/agenda";

export const AGENDA_STATUSES = ["Pendente", "Realizado", "Cancelado"] as const;
export type AgendaStatus = (typeof AGENDA_STATUSES)[number];

/** Módulo cujo departamento filtra a agenda compartilhada. */
export type AgendaModule = "contabil" | "pessoal" | "triagem";

export interface AgendaEvent {
  id: string;
  agenda: string;
  date: string;
  // Registros legados podem ter estado fora da lista ou vazio.
  status: string | null;
  obs: string | null;
  location: string | null;
  client: { id: string; name: string } | null;
  /** Responsável pelo evento; sem ele, o evento entra na "minha agenda" de todos. */
  participant: { id: string; name: string } | null;
  /** Preenchido quando o evento é ocorrência de uma recorrência mensal. */
  recurring_agenda_id: string | null;
}

export interface AgendaEventPayload {
  agenda: string;
  date: string;
  status: AgendaStatus;
  obs: string | null;
  /** Repete todo mês; desligar encerra a série e mantém os eventos já criados. */
  recurrent?: boolean;
}

/** Evento de dia inteiro: meio-dia UTC mantém o dia escolhido em qualquer fuso do Brasil. */
export function agendaDateToIso(day: string): string {
  return `${day}T12:00:00.000Z`;
}

export function agendaDay(isoDate: string): string {
  return isoDate.slice(0, 10);
}
