export const AGENDA_ENDPOINT = "/task/agenda";

export const AGENDA_STATUSES = ["Pendente", "Realizado", "Cancelado"] as const;
export type AgendaStatus = (typeof AGENDA_STATUSES)[number];

/** Módulo cujo departamento filtra a agenda compartilhada. */
export type AgendaModule = "contabil" | "triagem";

export interface AgendaEvent {
  id: string;
  agenda: string;
  date: string;
  // Registros legados podem ter estado fora da lista ou vazio.
  status: string | null;
  obs: string | null;
  location: string | null;
}

export interface AgendaEventPayload {
  agenda: string;
  date: string;
  status: AgendaStatus;
  obs: string | null;
}

/** Evento de dia inteiro: meio-dia UTC mantém o dia escolhido em qualquer fuso do Brasil. */
export function agendaDateToIso(day: string): string {
  return `${day}T12:00:00.000Z`;
}

export function agendaDay(isoDate: string): string {
  return isoDate.slice(0, 10);
}
