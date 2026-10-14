const OFFICE_SCORE_FORMULA_VERSION = "OfficeV1";
const LEGACY_SCORE_FORMULA_VERSION = "LegacyV1";

export function canRecalculateScoreQuarter(
  formulaVersion: string,
  evaluations: readonly { status: string }[],
  allowCompletingOfficeQuarter = false,
): boolean {
  if (formulaVersion === LEGACY_SCORE_FORMULA_VERSION) {
    return true;
  }

  const hasPendingEvaluation = evaluations.some((evaluation) => evaluation.status === "Pending");
  const allEvaluationsCompleted =
    evaluations.length > 0 && evaluations.every((evaluation) => evaluation.status === "Completed");

  return (
    formulaVersion === OFFICE_SCORE_FORMULA_VERSION &&
    (hasPendingEvaluation || (allowCompletingOfficeQuarter && allEvaluationsCompleted))
  );
}

/** Nitro só pode mudar quando o score também pode ser recalculado com a mesma fórmula. */
export function canUpdateScoreNitro(
  formulaVersion: string,
  evaluations: readonly { status: string }[],
): boolean {
  return (
    formulaVersion === LEGACY_SCORE_FORMULA_VERSION ||
    (formulaVersion === OFFICE_SCORE_FORMULA_VERSION &&
      evaluations.some((evaluation) => evaluation.status === "Pending"))
  );
}
