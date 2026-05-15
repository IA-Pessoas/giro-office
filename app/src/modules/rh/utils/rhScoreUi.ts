import type {

  RhPendingScoreEvaluation,

  RhScoreQuestionType,

  RhScoreQuarter,

} from "../types";



const SCORE_TYPE_LABELS: Record<RhScoreQuestionType, string> = {

  behavioral: "Comportamental",

  leadership: "Lideran\u00e7a",

  tech: "Tecnologia",

  technical: "T\u00e9cnico",

};



const SCORE_TYPE_ORDER: RhScoreQuestionType[] = [

  "behavioral",

  "technical",

  "tech",

  "leadership",

];



const EVALUATOR_ROLE_LABELS: Record<string, string> = {

  DIRECTOR: "Diretoria",

  LEADER: "Lideran\u00e7a",

  RH: "RH",

  SELF: "Autoavalia\u00e7\u00e3o",

  SUBORDINATE: "Subordinado",

  TI: "TI",

};



const SCORE_STATUS_LABELS: Record<string, string> = {

  Completed: "Conclu\u00edda",

  Pending: "Pendente",

};



const QUARTER_PATTERN = /^(\d{4})-Q([1-4])$/i;



export function getRhScoreTypeLabel(type: RhScoreQuestionType | string | null | undefined) {

  if (!type) {

    return "Tipo n\u00e3o informado";

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



  for (let year = currentYear; year <= currentYear + 1; year += 1) {

    for (let quarter = 1; quarter <= 4; quarter += 1) {

      const value = buildRhQuarterValue(year, quarter);

      options.push({

        value,

        label: formatRhQuarterLabel(value),

      });

    }

  }



  return options;

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



export function getRhScoreEvaluatorRoleLabel(role: string | null | undefined) {

  if (!role) {

    return "Perfil n\u00e3o informado";

  }



  return EVALUATOR_ROLE_LABELS[role] ?? role;

}



export function getRhScoreStatusLabel(status: string | null | undefined) {

  if (!status) {

    return "Status n\u00e3o informado";

  }



  return SCORE_STATUS_LABELS[status] ?? status;

}



export function getRhScoreQuestionPrompt(

  questionText: string | null | undefined,

  questionId?: string | null,

) {

  const trimmedText = questionText?.trim();

  if (trimmedText) {

    return trimmedText;

  }



  if (questionId?.trim()) {

    return "Pergunta n\u00e3o dispon\u00edvel";

  }



  return "Pergunta n\u00e3o identificada";

}



export function getRhScoreUserSummary(
  userName: string | null | undefined,
  userId?: string | null | undefined,
) {
  const trimmedName = userName?.trim();

  if (trimmedName) {
    return trimmedName;
  }

  if (!userId?.trim()) {
    return "Nome n\u00e3o dispon\u00edvel";
  }

  return "Nome n\u00e3o dispon\u00edvel";
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
  return evaluation.scoreQuarter.user?.name?.trim() || "Colaborador n\u00e3o informado";
}

export function formatRhEvaluationCountLabel(
  count: number | null | undefined,
  suffix?: "registered",
) {
  const safeCount = count ?? 0;

  if (suffix === "registered") {
    return safeCount === 1 ? "avaliação registrada" : "avaliações registradas";
  }

  return safeCount === 1 ? "avaliação" : "avaliações";
}
