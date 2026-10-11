/**
 * Valor decimal do serviço ("1234.5", "-10.00") em reais sem passar por float: "R$ 1.234,50".
 * Devolve `fallback` para valor ausente.
 */
export function formatMoney(value: string | null | undefined, fallback = "—"): string {
  if (!value) return fallback;
  const negative = value.startsWith("-");
  const [integer = "0", fraction = ""] = value.replace("-", "").split(".");
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/gu, ".");
  return `${negative ? "-" : ""}R$ ${grouped},${fraction.padEnd(2, "0").slice(0, 2)}`;
}
