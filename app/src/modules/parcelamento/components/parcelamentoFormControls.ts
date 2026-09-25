// Mesmas opções nos filtros da lista e no formulário de parcelamento (#1349).
export const INSTALLMENT_TYPE_OPTIONS = [
  "Federal",
  "Estadual",
  "Municipal",
  "Simplificado",
  "SIMPLES",
];
export const INSTALLMENT_JURISDICTION_OPTIONS = ["PGFN", "RFB", "Federal", "Estadual", "Municipal"];

export const parcelamentoTextFieldClassName =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm outline-none transition-colors placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder:text-gray-500 dark:disabled:bg-gray-900";

export const parcelamentoPrimaryButtonClassName =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60";

export const parcelamentoSecondaryButtonClassName =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700";

export const parcelamentoCheckboxCardClassName =
  "flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300";
