import type { ModuleAccess } from "@modules/auth";

import type { IntegracaoTaskListItem } from "../types";

export const TASK_TABLE_HEAD_CELL_CLASSNAME =
  "px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-blue-200/80";

export const TASK_TABLE_CELL_CLASSNAME = "px-3 py-3 text-sm text-slate-600 dark:text-slate-200";

export const TASK_TABLE_NAME_HEAD_CELL_CLASSNAME = `${TASK_TABLE_HEAD_CELL_CLASSNAME} w-44 pl-5`;

export const TASK_TABLE_NAME_CELL_CLASSNAME = `${TASK_TABLE_CELL_CLASSNAME} pl-5`;

export const TASK_TABLE_BADGE_CLASSNAME =
  "inline-flex min-h-6 items-center justify-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold";

export const TASK_TABLE_CLASSNAME = "w-[1120px] min-w-full table-fixed";

export const TASK_TABLE_SCROLL_AREA_CLASSNAME =
  "overflow-x-auto [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-slate-200/60 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-400/80 dark:[&::-webkit-scrollbar-track]:bg-slate-800 dark:[&::-webkit-scrollbar-thumb]:bg-slate-600";

export const TASK_TABLE_ACTION_HEAD_CELL_CLASSNAME =
  "w-24 px-3 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-blue-200/80";

export const TASK_TABLE_ACTION_CELL_CLASSNAME = "px-3 py-3";

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

export function canEditIntegracaoTask(
  access: Pick<ModuleAccess, "level">,
  task: Pick<IntegracaoTaskListItem, "isOwn">,
): boolean {
  return access.level === "edit" || access.level === "admin" || task.isOwn;
}
