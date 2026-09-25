/**
 * Formatação única de datas do app (#1366), em pt-BR qualquer que seja o idioma do navegador.
 *
 * - Data civil (vencimento, abertura, adesão): é um dia do calendário, não um instante. Lê o
 *   "AAAA-MM-DD" do texto sem passar por `Date`, então nunca desloca um dia por causa do fuso.
 * - Instante (histórico, mensagens): mostrado no fuso do navegador, em 24h.
 */

const CIVIL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})/u;

export function formatCivilDate(value: string | null | undefined, fallback = ""): string {
  const match = value ? CIVIL_DATE_PATTERN.exec(value) : null;
  return match ? `${match[3]}/${match[2]}/${match[1]}` : fallback;
}

function toValidDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

const DATE_TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
};

const TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
};

export function formatDateTime(value: string | Date | null | undefined, fallback = ""): string {
  const date = toValidDate(value);
  return date ? date.toLocaleString("pt-BR", DATE_TIME_OPTIONS).replace(",", "") : fallback;
}

export function formatTime(value: string | Date | null | undefined, fallback = ""): string {
  const date = toValidDate(value);
  return date ? date.toLocaleTimeString("pt-BR", TIME_OPTIONS) : fallback;
}
