import { formatBrlAmount, parseBrlInput } from "../../../shared/utils/inputFormatting.ts";

/**
 * Valor digitado no campo de receita ("R$ 1.234,5") no formato da API ("1234.50").
 * Campo vazio ou sem dígitos devolve null: a UI recusa em vez de gravar zero, porque zero
 * informado e competência sem registro são casos distintos (#1560).
 */
export function toRevenueAmount(input: string): string | null {
  if (input.includes("-")) return null;
  const value = parseBrlInput(input);
  return value === null ? null : value.toFixed(2);
}

/** Valor da API ("1234.5") no formato do campo de moeda ("R$ 1.234,50"). */
export function formatRevenueAmount(amount: string): string {
  return formatBrlAmount(Number(amount));
}

const percentFormatter = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

/** Percentual da API ("2.0025") em pt-BR ("2,0025%"), com ao menos duas casas. */
export function formatRatePercent(value: string): string {
  return `${percentFormatter.format(Number(value))}%`;
}

/** Competência no formato AAAA-MM, deslocada em meses a partir do mês atual. */
export function competenceFromToday(offsetMonths = 0): string {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth() + offsetMonths, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** Competência seguinte (AAAA-MM), à qual a alíquota emitida se refere. */
export function nextCompetence(competence: string): string {
  const [year, month] = competence.split("-").map(Number);
  const date = new Date(year, month, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** CPF/CNPJ colados em lote: um por linha (aceita também vírgula ou ponto e vírgula). */
export function parseBatchDocuments(text: string): string[] {
  return text
    .split(/[\r\n,;]+/u)
    .map((value) => value.trim())
    .filter(Boolean);
}

export function formatCompetenceLabel(competence: string): string {
  return `${competence.slice(5, 7)}/${competence.slice(0, 4)}`;
}
