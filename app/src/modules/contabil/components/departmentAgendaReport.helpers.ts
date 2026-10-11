import type { AgendaEvent } from "@shared/services/agendaService.contract";

/** O serviço lista por mês: o relatório faz uma consulta por mês do intervalo. */
export const AGENDA_REPORT_MAX_MONTHS = 12;

const DAY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** Meses (AAAA-MM) que o intervalo de dias AAAA-MM-DD toca; vazio se o intervalo for inválido. */
export function agendaReportMonths(from: string, to: string): string[] {
  if (!DAY_PATTERN.test(from) || !DAY_PATTERN.test(to) || from > to) return [];
  const last = to.slice(0, 7);
  const months: string[] = [];
  let [year, month] = from.split("-").map(Number);
  // Ano com quatro dígitos: o campo de data passa por 0002, 0020... enquanto se digita.
  const monthKey = () => `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
  for (let key = monthKey(); key <= last; key = monthKey()) {
    months.push(key);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months;
}

/** Eventos dentro do intervalo de dias, em ordem de data: os meses vêm inteiros do serviço. */
export function agendaReportEvents(
  events: readonly AgendaEvent[],
  from: string,
  to: string,
): AgendaEvent[] {
  return events
    .filter((event) => {
      // Mesmo corte de `agendaDay`; aqui sem importar o contrato, para o helper rodar nos testes.
      const day = event.date.slice(0, 10);
      return day >= from && day <= to;
    })
    .sort(
      (left, right) =>
        left.date.localeCompare(right.date) || left.agenda.localeCompare(right.agenda, "pt-BR"),
    );
}
