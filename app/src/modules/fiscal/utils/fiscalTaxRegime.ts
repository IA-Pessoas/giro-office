import { TAX_REGIME_OPTIONS } from "@workspace/shared/regularize";

// Código numérico herdado de tb_fiscal.tributacao_pis_cofins.regime.
export const FISCAL_TAX_REGIME_OPTIONS = TAX_REGIME_OPTIONS.map((label, index) => ({
  value: String(index),
  label,
}));

export function formatFiscalTaxRegime(value: string | null | undefined): string {
  const code = value?.trim() ?? "";
  return FISCAL_TAX_REGIME_OPTIONS.find((option) => option.value === code)?.label ?? code;
}
