import type {
  RhPendingScoreEvaluation,
  RhScoreQuestionType,
  RhScoreQuarter,
} from "../types";

const SCORE_TYPE_LABELS: Record<RhScoreQuestionType, string> = {
  behavioral: "Comportamental",
  leadership: "Liderança",
  tech: "Técnico",
  technical: "Técnico",
};

const SCORE_TYPE_ORDER: RhScoreQuestionType[] = [
  "behavioral",
  "technical",
  "tech",
  "leadership",
];

const QUARTER_PATTERN = /^(\d{4})-Q([1-4])$/i;

export function getRhScoreTypeLabel(type: RhScoreQuestionType | string | null | undefined) {
  if (!type) {
    return "Tipo não informado";
  }

  return SCORE_TYPE_LABELS[type as RhScoreQuestionType] ?? type;
}

export function formatRhQuarterLabel(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  const match = QUARTER_PATTERN.exec(value.trim());
  if (!match) {
    return value;
  }

  return `Q${match[2]} ${match[1]}`;
}

export function buildRhQuarterValue(year: number, quarter: number) {
  return `${year}-Q${quarter}`;
}

export function getRhQuarterOptions(referenceDate = new Date()) {
  const currentYear = referenceDate.getFullYear();
  const options: Array<{ value: string; label: string }> = [];

  for (let year = currentYear - 1; year <= currentYear + 1; year += 1) {
    for (let quarter = 1; quarter <= 4; quarter += 1) {
      const value = buildRhQuarterValue(year, quarter);
      options.push({
        value,
        label: formatRhQuarterLabel(value),
      });
    }
  }

  return options.sort((left, right) => right.value.localeCompare(left.value));
}

export function getDefaultRhQuarterValue(referenceDate = new Date()) {
  const month = referenceDate.getMonth();
  const quarter = Math.floor(month / 3) + 1;
  return buildRhQuarterValue(referenceDate.getFullYear(), quarter);
}

export function formatRhScoreValue(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }

  return Number(value).toFixed(1);
}

export function getRhScoreQuestionTypeOptions() {
  return SCORE_TYPE_ORDER.map((type) => ({
    value: type,
    label: getRhScoreTypeLabel(type),
  }));
}

export function getRhScoreDetailCategoryRows(score: RhScoreQuarter) {
  return [
    {
      key: "behavioral",
      label: getRhScoreTypeLabel("behavioral"),
      value: score.behavioral,
    },
    {
      key: "technical",
      label: getRhScoreTypeLabel("technical"),
      value: score.technical ?? score.technology,
    },
    {
      key: "leadership",
      label: getRhScoreTypeLabel("leadership"),
      value: score.leadership,
    },
  ];
}

export function getRhPendingEvaluationTargetName(evaluation: RhPendingScoreEvaluation) {
  return evaluation.scoreQuarter.user?.name?.trim() || "Colaborador não informado";
}
