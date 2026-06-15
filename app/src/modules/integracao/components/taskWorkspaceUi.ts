export const TASK_TABLE_HEAD_CELL_CLASSNAME =
  "px-4 py-4 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-blue-200/80";

export const TASK_TABLE_CELL_CLASSNAME = "px-4 py-4 text-sm text-slate-600 dark:text-slate-200";

export const TASK_TABLE_BADGE_CLASSNAME =
  "inline-flex min-h-7 items-center justify-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold";

export const TASK_TABLE_ACTION_HEAD_CELL_CLASSNAME =
  "w-44 px-4 py-4 text-center text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-blue-200/80";

export const TASK_TABLE_ACTION_CELL_CLASSNAME =
  "px-4 py-4";

export const TASK_TABLE_ACTION_BUTTON_CLASSNAME =
  "inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-slate-200 text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800";

export const TASK_TABLE_DANGER_ACTION_BUTTON_CLASSNAME =
  "inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-rose-200 text-rose-700 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-900/60 dark:text-rose-300 dark:hover:bg-rose-950/30";

interface FormatTasksFooterSummaryParams {
  page: number;
  count: number;
}

export function formatTasksFooterSummary({ count }: FormatTasksFooterSummaryParams): string {
  if (count === 0) {
    return "Nenhuma tarefa carregada.";
  }

  return count === 1 ? "1 tarefa carregada." : `${count} tarefas carregadas.`;
}
