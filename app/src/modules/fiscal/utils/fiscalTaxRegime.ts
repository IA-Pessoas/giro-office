import { TAX_REGIME_OPTIONS, type TaxRegime } from "@workspace/shared/regularize";

// Código numérico herdado de tb_fiscal.tributacao_pis_cofins.regime.
// Código gravado no banco explícito por regime: reordenar a lista não muda o significado.
const FISCAL_TAX_REGIME_CODES = {
  "Simples Nacional": "0",
  "Lucro Presumido": "1",
  "Lucro Real": "2",
} as const satisfies Record<TaxRegime, string>;

export const FISCAL_TAX_REGIME_OPTIONS = TAX_REGIME_OPTIONS.map((label) => ({
  value: FISCAL_TAX_REGIME_CODES[label],
  label,
}));

export function formatFiscalTaxRegime(value: string | null | undefined): string {
  const code = value?.trim() ?? "";
  return FISCAL_TAX_REGIME_OPTIONS.find((option) => option.value === code)?.label ?? code;
}
