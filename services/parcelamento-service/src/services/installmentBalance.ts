// Saldo devedor do parcelamento (#1349). Com valor total informado, o saldo é a fração das
// parcelas restantes sobre esse total; sem ele (legado), restantes × valor da parcela atual.
export function computeOutstandingBalance(input: {
  total: number;
  agreed: number;
  remaining: number;
  currentAmount: number;
}): number {
  const raw =
    input.total > 0 && input.agreed > 0
      ? (input.total * input.remaining) / input.agreed
      : input.remaining * input.currentAmount;

  return Math.round(raw * 100) / 100;
}
