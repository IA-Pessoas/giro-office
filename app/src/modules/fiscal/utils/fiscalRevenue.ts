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

export function formatCompetenceLabel(competence: string): string {
  return `${competence.slice(5, 7)}/${competence.slice(0, 4)}`;
}
