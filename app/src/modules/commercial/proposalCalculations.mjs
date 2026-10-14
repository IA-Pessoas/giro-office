export function calculateProposalRecurringAmount(referenceSalary, percentage) {
  if (!Number.isFinite(referenceSalary) || !Number.isFinite(percentage)) return null;
  return Math.round(referenceSalary * percentage / 100);
}

export function calculateProposalSingleTotal(quantity, unitPriceInCents) {
  if (!Number.isFinite(quantity) || !Number.isFinite(unitPriceInCents)) return null;
  return Math.round(quantity * unitPriceInCents);
}

export function calculateProposalDiscountedTotal(totalInCents, discount, unit) {
  if (!Number.isFinite(totalInCents) || !Number.isFinite(discount)) return null;
  if (unit === "BRL") return Math.max(0, Math.round(totalInCents - discount));
  if (unit === "PERCENT") return Math.max(0, Math.round(totalInCents * (1 - discount / 100)));
  return null;
}
