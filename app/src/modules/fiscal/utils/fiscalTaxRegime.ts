// Código numérico herdado de tb_fiscal.tributacao_pis_cofins.regime.
export const FISCAL_TAX_REGIME_OPTIONS = [
  { value: "0", label: "Simples Nacional" },
  { value: "1", label: "Lucro Presumido" },
  { value: "2", label: "Lucro Real" },
] as const;

export function formatFiscalTaxRegime(value: string | null | undefined): string {
  const code = value?.trim() ?? "";
  return FISCAL_TAX_REGIME_OPTIONS.find((option) => option.value === code)?.label ?? code;
}
