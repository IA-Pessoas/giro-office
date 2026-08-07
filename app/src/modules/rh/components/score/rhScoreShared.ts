import { isAxiosError } from "axios";
import type {
  AssignableUser,
  RhNitroMetricType,
  RhScoreQuestion,
  RhScoreQuestionType,
  RhScoreQuarter,
} from "../../types";

type RhScoreTab = "questions" | "pending" | "history";

type RhScoreQuestionFilter = RhScoreQuestionType | "all";

const RH_SCORE_EVALUATION_GROUP_ORDER: RhScoreQuestionType[] = [
  "behavioral",
  "technical",
  "tech",
  "leadership",
];

interface RhScoreQuestionFormState {
  question: string;
  type: RhScoreQuestionType;
}

interface NitroDraftState {
  projects: string;
  hours: string;
  errors: string;
  folders: string;
}

const SCORE_TAB_META: Record<RhScoreTab, { label: string; description: string }> = {
  history: {
    label: "Histórico",
    description: "Consulte ciclos trimestrais e detalhes.",
  },

  pending: {
    label: "Pendentes",
    description: "Responda as avaliações atribuídas ao seu perfil.",
  },

  questions: {
    label: "Perguntas",
    description: "Gerencie perguntas e gere ciclos.",
  },
};

const DEFAULT_QUESTION_FORM_STATE: RhScoreQuestionFormState = {
  question: "",
  type: "behavioral",
};

const EMPTY_NITRO_DRAFT: NitroDraftState = {
  projects: "",
  hours: "",
  errors: "",
  folders: "",
};

const RH_NITRO_METRICS: Array<[RhNitroMetricType, string]> = [
  ["projects", "Projetos"],
  ["hours", "Horas"],
  ["errors", "Erros"],
  ["folders", "Pastas"],
];

const RH_VISIBLE_NITRO_METRICS = RH_NITRO_METRICS.filter(([type]) => type !== "folders");
const RH_NITRO_MIN = 0;
const RH_NITRO_MAX = 5;

function getNitroMetricLabel(metric: RhNitroMetricType, defaultLabel: string) {
  if (metric === "errors") {
    return "Erros (-)";
  }

  return defaultLabel;
}

function getNitroMetricHint(metric: RhNitroMetricType) {
  if (metric === "errors") {
    return "Reduz o score final";
  }

  return "Impacto positivo no score";
}

function getErrorMessage(error: unknown, fallbackMessage: string) {
  if (isAxiosError(error)) {
    return (
      error.response?.data?.error ??
      error.response?.data?.message ??
      error.message ??
      fallbackMessage
    );
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return fallbackMessage;
}

function buildQuestionFormState(question: RhScoreQuestion | null): RhScoreQuestionFormState {
  if (!question) {
    return DEFAULT_QUESTION_FORM_STATE;
  }

  return {
    question: question.question,
    type: question.type === "tech" ? "technical" : question.type,
  };
}

function buildNitroDraft(score: RhScoreQuarter | undefined): NitroDraftState {
  return {
    projects: score?.nitro?.projects_score?.toString() ?? "",
    hours: score?.nitro?.hours_score?.toString() ?? "",
    errors: score?.nitro?.errors_score?.toString() ?? "",
    folders: score?.nitro?.folders_score?.toString() ?? "",
  };
}

function normalizeNitroInput(rawValue: string) {
  if (!rawValue.trim()) {
    return "";
  }

  const sanitizedValue = rawValue.replace(",", ".");
  const parsedValue = Number(sanitizedValue);

  if (!Number.isFinite(parsedValue)) {
    return rawValue;
  }

  const clampedValue = Math.min(RH_NITRO_MAX, Math.max(RH_NITRO_MIN, parsedValue));
  return String(clampedValue);
}

function getAssignableUserLabel(user: AssignableUser) {
  const parts = [user.name.trim()];
  if (user.departmentName) {
    parts.push(user.departmentName);
  }

  return parts.join(" - ");
}

function getScoreChoiceClassName(isSelected: boolean) {
  if (isSelected) {
    return "border-blue-600 bg-blue-600 text-white shadow-sm";
  }
  return "border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-200 dark:hover:border-blue-500 dark:hover:bg-slate-800";
}

export type { NitroDraftState, RhScoreQuestionFilter, RhScoreQuestionFormState, RhScoreTab };
export {
  DEFAULT_QUESTION_FORM_STATE,
  EMPTY_NITRO_DRAFT,
  RH_NITRO_MAX,
  RH_NITRO_METRICS,
  RH_NITRO_MIN,
  RH_SCORE_EVALUATION_GROUP_ORDER,
  RH_VISIBLE_NITRO_METRICS,
  SCORE_TAB_META,
  buildNitroDraft,
  buildQuestionFormState,
  getAssignableUserLabel,
  getErrorMessage,
  getNitroMetricHint,
  getNitroMetricLabel,
  getScoreChoiceClassName,
  normalizeNitroInput,
};
