export const FISCAL_MALHA_STATUS_LABELS = {
  aberta: "Aberta",
  em_andamento: "Em andamento",
  aguardando_cliente: "Aguardando cliente",
  respondida: "Respondida",
  encerrada: "Encerrada",
} as const;

export type FiscalMalhaStatus = keyof typeof FISCAL_MALHA_STATUS_LABELS;

export const FISCAL_MALHA_HISTORY_FIELD_LABELS = {
  deadline: "Prazo",
  status: "Situação",
  responsible_id: "Responsável",
} as const;

/** AAAA-MM-DD → DD/MM/AAAA, sem passar por fuso horário. */
export function formatMalhaDate(value: string | null): string {
  if (!value) return "Sem prazo";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

/** Período AAAA-MM a AAAA-MM → "01/2025 a 12/2025" (ou um mês só). */
export function formatMalhaPeriod(start: string, end: string): string {
  const label = (value: string) => `${value.slice(5, 7)}/${value.slice(0, 4)}`;
  return start === end ? label(start) : `${label(start)} a ${label(end)}`;
}

/** Valor do histórico em texto legível; responsável vira nome quando conhecido. */
export function formatMalhaHistoryValue(
  field: keyof typeof FISCAL_MALHA_HISTORY_FIELD_LABELS,
  value: string | null,
  userName: (id: string) => string | undefined,
): string {
  if (value === null) return field === "deadline" ? "Sem prazo" : "Nenhum";
  if (field === "deadline") return formatMalhaDate(value);
  if (field === "status") {
    return FISCAL_MALHA_STATUS_LABELS[value as FiscalMalhaStatus] ?? value;
  }
  return userName(value) ?? "Usuário sem acesso atual";
}
