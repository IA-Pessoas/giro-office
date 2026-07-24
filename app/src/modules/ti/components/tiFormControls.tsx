import type { HTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import { Loader2, RefreshCw, type LucideIcon } from "lucide-react";

import { cn } from "@shared/ui/newLayout/utils";

import {
  tiInputClassName,
  tiMutedPanelClassName,
  tiPanelClassName,
  tiPrimaryButtonClassName,
  tiSecondaryButtonClassName,
  tiLabelClassName,
} from "./tiWorkspaceUi";

type TiEmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
};

type TiSectionHeaderProps = {
  title: string;
  description?: string;
  action?: ReactNode;
};

type TiIconActionProps = {
  icon: LucideIcon;
  label: string;
  type?: "button" | "submit";
  variant?: "primary" | "secondary";
  disabled?: boolean;
  onClick?: () => void;
};

type TiTableActionProps = {
  icon: LucideIcon;
  label: string;
  disabled?: boolean;
  onClick?: () => void;
};

type TiListQuery<T> = {
  data?: T[];
  error: Error | null;
  isError: boolean;
  isFetching: boolean;
  isLoading: boolean;
  refetch: () => Promise<unknown>;
};

type TiTextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  helperText?: string;
};

type TiTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  helperText?: string;
};

export function TiEmptyState({ icon: Icon, title, description, action }: TiEmptyStateProps) {
  return (
    <div className={cn(tiMutedPanelClassName, "flex flex-col items-start gap-4 sm:flex-row")}>
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white text-slate-700 shadow-sm dark:bg-slate-950 dark:text-slate-200">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <h3 className="text-base font-semibold text-slate-950 dark:text-white">{title}</h3>
        <p className="max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
          {description}
        </p>
        {action ? <div className="pt-2">{action}</div> : null}
      </div>
    </div>
  );
}

export function TiSectionHeader({ title, description, action }: TiSectionHeaderProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-1">
        <h2 className="text-xl font-semibold text-slate-950 dark:text-white">{title}</h2>
        {description ? (
          <p className="max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

type TiPanelProps = HTMLAttributes<HTMLElement> & {
  children: ReactNode;
};

export function TiPanel({ children, className, ...props }: TiPanelProps) {
  return (
    <section className={cn(tiPanelClassName, className)} {...props}>
      {children}
    </section>
  );
}

export function TiTextField({ className, helperText, label, ...props }: TiTextFieldProps) {
  return (
    <label className="flex min-w-0 flex-col gap-2">
      {label ? <span className={tiLabelClassName}>{label}</span> : null}
      <input className={cn(tiInputClassName, className)} {...props} />
      {helperText ? (
        <span className="text-xs leading-5 text-slate-500 dark:text-slate-400">{helperText}</span>
      ) : null}
    </label>
  );
}

export function TiTextarea({ className, helperText, label, ...props }: TiTextareaProps) {
  return (
    <label className="flex min-w-0 flex-col gap-2">
      {label ? <span className={tiLabelClassName}>{label}</span> : null}
      <textarea
        className={cn(tiInputClassName, "min-h-24 resize-y py-2", className)}
        {...props}
      />
      {helperText ? (
        <span className="text-xs leading-5 text-slate-500 dark:text-slate-400">{helperText}</span>
      ) : null}
    </label>
  );
}

export function TiIconAction({
  icon: Icon,
  label,
  type = "button",
  variant = "secondary",
  disabled,
  onClick,
}: TiIconActionProps) {
  return (
    <button
      type={type}
      className={variant === "primary" ? tiPrimaryButtonClassName : tiSecondaryButtonClassName}
      disabled={disabled}
      onClick={onClick}
      title={label}
    >
      <Icon className="h-4 w-4" />
      <span>{label}</span>
    </button>
  );
}

export function TiTableAction({ disabled, icon: Icon, label, onClick }: TiTableActionProps) {
  return (
    <button
      type="button"
      className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
      disabled={disabled}
      onClick={onClick}
      title={label}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span>{label}</span>
    </button>
  );
}

export function TiQueryStatePanel<T>({
  children,
  emptyState,
  query,
}: {
  children: (rows: T[]) => ReactNode;
  emptyState: ReactNode;
  query: TiListQuery<T>;
}) {
  if (query.isLoading) {
    return (
      <div className="flex min-h-32 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-6 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando informações...
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900/40 dark:bg-red-950/20">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-red-700 dark:text-red-300">
              Não conseguimos carregar as informações.
            </p>
            <p className="mt-1 text-sm text-red-600 dark:text-red-300/80">
              {query.error?.message ?? "Tente novamente."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              void query.refetch();
            }}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-red-200 bg-white px-3 text-sm font-semibold text-red-700 transition hover:bg-red-50 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200 dark:hover:bg-red-950/50"
          >
            <RefreshCw className="h-4 w-4" />
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  const rows = query.data ?? [];

  if (rows.length === 0) {
    return <>{emptyState}</>;
  }

  return (
    <div className="space-y-2">
      {query.isFetching ? (
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Atualizando...
        </div>
      ) : null}
      {children(rows)}
    </div>
  );
}

export function TiDataTable({
  children,
  className,
  footer,
  headers,
}: {
  children: ReactNode;
  className?: string;
  footer?: ReactNode;
  headers: string[];
}) {
  return (
    <div
      className={cn(
        "overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900",
        className,
      )}
    >
      <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
          <tr>
            {headers.map((header) => (
              <th
                key={header || "actions"}
                scope="col"
                className={cn(
                  "px-4 py-3 font-semibold",
                  header ? "text-left" : "text-right",
                )}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">{children}</tbody>
      </table>
      {footer}
    </div>
  );
}

export function TiDetailPanel({ children, title }: { children: ReactNode; title: string }) {
  return (
    <aside className="flex h-full min-h-48 flex-col rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <h3 className="text-sm font-semibold text-slate-950 dark:text-white">{title}</h3>
      <div className="mt-3 flex flex-1 flex-col space-y-2 text-sm text-slate-600 dark:text-slate-300">
        {children}
      </div>
    </aside>
  );
}

export function TiFieldLine({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-2 last:border-b-0 last:pb-0 dark:border-slate-800">
      <span className="shrink-0 text-xs font-semibold uppercase text-slate-500 dark:text-slate-500">
        {label}
      </span>
      <span className="min-w-0 text-right font-medium text-slate-800 dark:text-slate-100">
        {value}
      </span>
    </div>
  );
}

export function TiInlineNotice({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "danger" | "warning";
  children: ReactNode;
}) {
  const toneClassName =
    tone === "danger"
      ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200"
        : "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300";

  return <div className={cn("rounded-lg border p-3 text-sm", toneClassName)}>{children}</div>;
}
