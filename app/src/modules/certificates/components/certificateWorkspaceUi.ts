import type { CSSProperties } from "react";

const MILLISECONDS_IN_DAY = 24 * 60 * 60 * 1000;

export const CERTIFICATE_PANEL_CLASSNAME =
  "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900";

export const CERTIFICATE_SUBPANEL_CLASSNAME =
  "rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950/40";

export const CERTIFICATE_COMPACT_BUTTON_CLASSNAME =
  "inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800";

export const CERTIFICATE_FILTER_LABEL_CLASSNAME = "flex min-w-0 flex-col gap-1.5";

export const CERTIFICATE_FILTER_LABEL_TEXT_CLASSNAME =
  "flex h-5 items-center gap-2 text-sm font-semibold leading-5 text-slate-700 dark:text-white";

export const CERTIFICATE_FILTER_MENU_CLASSNAME =
  "absolute right-0 z-30 mt-2 w-[min(90vw,24rem)] rounded-xl border border-slate-200 bg-white p-3 shadow-lg shadow-slate-950/10 dark:border-slate-700 dark:bg-slate-900";

export const CERTIFICATE_FILTER_MENU_GRID_CLASSNAME = "grid gap-2 sm:grid-cols-2";

export const CERTIFICATE_FILTER_MENU_SELECT_CLASSNAME =
  "h-9 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100";

export const CERTIFICATE_SUMMARY_BAR_CLASSNAME =
  "rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-900";

export const CERTIFICATE_SUMMARY_ITEM_CLASSNAME =
  "flex min-h-14 items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-950/40";

export const CERTIFICATE_TAB_BUTTON_CLASSNAME =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800";

export const CERTIFICATE_TAB_ACTIVE_BUTTON_CLASSNAME =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-blue-600 bg-blue-600 px-3 text-sm font-semibold text-white shadow-sm shadow-blue-950/10 transition-colors hover:bg-blue-700 dark:border-blue-500 dark:bg-blue-500 dark:text-white dark:hover:bg-blue-400";

export const CERTIFICATE_PRIMARY_BUTTON_CLASSNAME =
  "inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50";

export const CERTIFICATE_SECONDARY_BUTTON_CLASSNAME =
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800";

export const CERTIFICATE_FORM_MODAL_CONTENT_CLASSNAME =
  "w-[min(92vw,760px)] [&>footer]:px-4 [&>footer]:py-3 [&>header]:px-4 [&>header]:py-3";

export const CERTIFICATE_FORM_MODAL_BODY_CLASSNAME = "max-h-[64vh] overflow-y-auto !px-4 !py-3";

export const CERTIFICATE_FORM_CLASSNAME = "space-y-3";

export const CERTIFICATE_FORM_GRID_CLASSNAME = "grid gap-3 md:grid-cols-2 lg:grid-cols-3";

export const CERTIFICATE_FORM_TEXTAREA_CLASSNAME = "min-h-20 resize-y";

export const CERTIFICATE_INPUT_CLASSNAME =
  "h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100";

export const CERTIFICATE_SELECT_ARROW_STYLE: CSSProperties = {
  appearance: "none",
  backgroundImage:
    'url("data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 fill=%22none%22 viewBox=%220 0 24 24%22 stroke=%22currentColor%22 stroke-width=%221.5%22%3E%3Cpath stroke-linecap=%22round%22 stroke-linejoin=%22round%22 d=%22m19 9-7 7-7-7%22/%3E%3C/svg%3E")',
  backgroundPosition: "right 0.75rem center",
  backgroundRepeat: "no-repeat",
  backgroundSize: "1rem",
  paddingRight: "2.5rem",
};

export const CERTIFICATE_TABLE_CLASSNAME = "w-full min-w-[760px] table-auto";

export const CERTIFICATE_TABLE_SCROLL_AREA_CLASSNAME =
  "overflow-x-auto [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-slate-200/60 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-400/80 dark:[&::-webkit-scrollbar-track]:bg-slate-800 dark:[&::-webkit-scrollbar-thumb]:bg-slate-600";

export const CERTIFICATE_TABLE_HEAD_CELL_CLASSNAME =
  "whitespace-nowrap px-6 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300";

export const CERTIFICATE_TABLE_CELL_CLASSNAME =
  "px-6 py-4 align-top text-sm text-gray-700 dark:text-gray-300";

export const CERTIFICATE_TABLE_EMPTY_CELL_CLASSNAME =
  "px-6 py-7 text-center text-sm text-slate-500 dark:text-slate-400";

export const CERTIFICATE_TABLE_NAME_HEAD_CELL_CLASSNAME = `${CERTIFICATE_TABLE_HEAD_CELL_CLASSNAME} min-w-48`;

export const CERTIFICATE_TABLE_NAME_CELL_CLASSNAME = `${CERTIFICATE_TABLE_CELL_CLASSNAME}`;

export const CERTIFICATE_TABLE_ACTION_HEAD_CELL_CLASSNAME =
  "w-24 px-6 py-2.5 text-center text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300";

export const CERTIFICATE_TABLE_ACTION_CELL_CLASSNAME = "px-6 py-4 text-center align-top";

export const CERTIFICATE_TABLE_ACTION_BUTTON_CLASSNAME =
  "inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-slate-200 text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800";

export const CERTIFICATE_BADGE_CLASSNAME =
  "inline-flex min-h-6 items-center justify-center rounded-full px-2.5 py-0.5 text-xs font-semibold";

export const CERTIFICATE_BADGE_TRUE_CLASSNAME =
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300";

export const CERTIFICATE_BADGE_FALSE_CLASSNAME =
  "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300";

export const CERTIFICATE_DATE_STATUS_UPCOMING_CLASSNAME =
  "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-300";

export const CERTIFICATE_DATE_STATUS_OK_CLASSNAME =
  "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";

export const CERTIFICATE_DATE_STATUS_EXPIRED_CLASSNAME =
  "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300";

export function formatDateBR(value: string | null | undefined): string {
  if (!value) {
    return "Sem informação";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Data inválida";
  }

  return date.toLocaleDateString("pt-BR");
}

export function formatDaysUntilExpiration(value: string): string {
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return "Data inválida";
  }

  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const deltaDays = Math.round((date.getTime() - startOfToday.getTime()) / MILLISECONDS_IN_DAY);

  if (deltaDays < 0) {
    return `${Math.abs(deltaDays)} dias em atraso`;
  }
  if (deltaDays === 0) {
    return "vence hoje";
  }

  return `${deltaDays} dias`;
}

export function getExpirationTone(value: string | null | undefined): {
  className: string;
  text: string;
} {
  if (!value) {
    return {
      className: CERTIFICATE_DATE_STATUS_OK_CLASSNAME,
      text: "sem validade",
    };
  }

  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return {
      className: CERTIFICATE_DATE_STATUS_OK_CLASSNAME,
      text: "Data inválida",
    };
  }

  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const deltaDays = Math.round((date.getTime() - startOfToday.getTime()) / MILLISECONDS_IN_DAY);

  if (deltaDays < 0) {
    return {
      className: CERTIFICATE_DATE_STATUS_EXPIRED_CLASSNAME,
      text: `${formatDaysUntilExpiration(value)} (expirado)`,
    };
  }

  if (deltaDays <= 30) {
    return {
      className: CERTIFICATE_DATE_STATUS_UPCOMING_CLASSNAME,
      text: `${formatDaysUntilExpiration(value)} (vence em breve)`,
    };
  }

  return {
    className: CERTIFICATE_DATE_STATUS_OK_CLASSNAME,
    text: `${formatDaysUntilExpiration(value)}`,
  };
}
