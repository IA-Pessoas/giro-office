import type { ReactNode } from "react";

const stateClassName = "rounded-xl px-3 py-4 text-sm";

interface ClientListStateProps {
  query: { isLoading: boolean; error: unknown };
  isEmpty: boolean;
  loading: string;
  error: string;
  empty: string;
  children: ReactNode;
}

/** Carregando → erro → vazio → lista, igual em todos os painéis do módulo clients. */
export function ClientListState({
  query,
  isEmpty,
  loading,
  error,
  empty,
  children,
}: ClientListStateProps) {
  if (query.isLoading) {
    return (
      <p
        role="status"
        className={`${stateClassName} bg-slate-50 text-slate-500 dark:bg-slate-950/40 dark:text-slate-400`}
      >
        {loading}
      </p>
    );
  }
  if (query.error) {
    return (
      <p
        role="alert"
        className={`${stateClassName} bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-200`}
      >
        {error}
      </p>
    );
  }
  if (isEmpty) {
    return (
      <p
        className={`${stateClassName} bg-slate-50 text-slate-600 dark:bg-slate-950/40 dark:text-slate-400`}
      >
        {empty}
      </p>
    );
  }
  return <>{children}</>;
}

export const clientListClassName =
  "divide-y divide-slate-200 rounded-xl border border-slate-200 dark:divide-slate-700 dark:border-slate-700";
