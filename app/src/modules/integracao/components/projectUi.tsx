export const PROJECT_PANEL_CLASSNAME =
  "rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900";

export const PROJECT_SUBPANEL_CLASSNAME =
  "rounded-2xl border border-slate-200 bg-slate-50/70 dark:border-slate-700 dark:bg-slate-950/40";

export const PROJECT_INPUT_CLASSNAME =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition-all placeholder:text-slate-400 focus:border-[var(--colors-brand-gradient-end)] focus:ring-2 focus:ring-[var(--colors-brand-gradient-start)]/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500";

export const PROJECT_SELECT_CLASSNAME =
  "w-full appearance-none rounded-xl border border-slate-200 bg-white bg-[length:14px] bg-[position:right_1rem_center] bg-no-repeat px-3 py-2.5 pr-12 text-sm text-slate-900 shadow-sm outline-none transition-all focus:border-[var(--colors-brand-gradient-end)] focus:ring-2 focus:ring-[var(--colors-brand-gradient-start)]/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white";

export const PROJECT_SELECT_ARROW_STYLE = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none'%3E%3Cpath d='m5 7.5 5 5 5-5' stroke='%2394a3b8' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
} as const;

export const PROJECT_PRIMARY_BUTTON_CLASSNAME =
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[var(--colors-brand-gradient-start)] to-[var(--colors-brand-gradient-end)] px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-950/20 transition-all hover:from-[var(--colors-brand-gradient-hover-start)] hover:to-[var(--colors-brand-gradient-hover-end)] disabled:cursor-not-allowed disabled:opacity-60";

export const PROJECT_SECONDARY_BUTTON_CLASSNAME =
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800";

export const PROJECT_COMPACT_PRIMARY_BUTTON_CLASSNAME =
  "inline-flex min-h-9 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-[var(--colors-brand-gradient-start)] to-[var(--colors-brand-gradient-end)] px-3 py-2 text-xs font-semibold text-white transition-all hover:from-[var(--colors-brand-gradient-hover-start)] hover:to-[var(--colors-brand-gradient-hover-end)] disabled:cursor-not-allowed disabled:opacity-60";

export const PROJECT_COMPACT_BUTTON_CLASSNAME =
  "inline-flex min-h-9 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800";

export const PROJECT_COMPACT_DANGER_BUTTON_CLASSNAME =
  "inline-flex min-h-9 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-rose-200 px-3 py-2 text-xs font-medium text-rose-700 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-900/60 dark:text-rose-300 dark:hover:bg-rose-950/30";

export function formatProjectDate(value: string | null | undefined) {
  if (!value) {
    return "Não informado";
  }

  return new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString("pt-BR");
}

export function getProjectStatusTone(status: string) {
  const normalized = status.toLowerCase();

  if (normalized.includes("concl")) {
    return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300";
  }

  if (normalized.includes("andamento") || normalized.includes("analise")) {
    return "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300";
  }

  if (normalized.includes("paus") || normalized.includes("paralis")) {
    return "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300";
  }

  if (normalized.includes("cancel") || normalized.includes("inativ")) {
    return "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300";
  }

  return "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
}

export function getProjectProgressWidthClassName(progress: number) {
  if (progress >= 100) {
    return "w-full";
  }

  if (progress >= 75) {
    return "w-5/6";
  }

  if (progress >= 50) {
    return "w-3/4";
  }

  if (progress >= 25) {
    return "w-1/2";
  }

  if (progress > 0) {
    return "w-1/4";
  }

  return "w-0";
}
