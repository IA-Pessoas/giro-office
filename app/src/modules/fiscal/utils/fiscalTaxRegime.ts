import { FISCAL_TAX_REGIME_CODES, TAX_REGIME_OPTIONS } from "@workspace/shared/regularize";

export const FISCAL_TAX_REGIME_OPTIONS = TAX_REGIME_OPTIONS.map((label) => ({
  value: FISCAL_TAX_REGIME_CODES[label],
  label,
}));

export function formatFiscalTaxRegime(value: string | null | undefined): string {
  const code = value?.trim() ?? "";
  return FISCAL_TAX_REGIME_OPTIONS.find((option) => option.value === code)?.label ?? code;
}
