export function calculateProposalRecurringAmount(
  referenceSalary: number,
  percentage: number,
): number | null;
export function calculateProposalSingleTotal(
  quantity: number,
  unitPriceInCents: number,
): number | null;
export function calculateProposalDiscountedTotal(
  totalInCents: number,
  discount: number,
  unit: "BRL" | "PERCENT" | "UNSPECIFIED",
): number | null;
