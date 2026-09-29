const FISCAL_FIELD_BASE_CLASSNAME =
  "rounded-lg border border-gray-300 bg-white px-3 text-gray-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white";

export const FISCAL_FIELD_CONTROL_CLASSNAME = `h-10 ${FISCAL_FIELD_BASE_CLASSNAME}`;

export const FISCAL_TEXTAREA_CLASSNAME = `py-2 font-mono text-sm ${FISCAL_FIELD_BASE_CLASSNAME}`;

export const FISCAL_FIELD_ERROR_CLASSNAME = "text-xs font-normal text-red-600 dark:text-red-400";

export const FISCAL_PRIMARY_BUTTON_CLASSNAME =
  "h-10 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60";

export const FISCAL_SECONDARY_BUTTON_CLASSNAME =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-blue-600 px-4 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-blue-400 dark:text-blue-300 dark:hover:bg-blue-900/20";

/** Competência AAAA-MM válida (mês 01–12). */
export function isCompetence(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export const INVALID_COMPETENCE_MESSAGE = "Informe a competência no formato mês/ano.";
