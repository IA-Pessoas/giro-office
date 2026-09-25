import { CheckCircle2, Clock3, CircleX, FileWarning, Loader2, Trash2 } from "lucide-react";

import type { ReportJobStatus } from "../types/report.types";

export const panelClassName =
  "rounded-xl border border-gray-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900";

export const reportCheckboxClassName =
  "h-4 w-4 accent-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600";

/** O histórico só traz o id do solicitante; o nome vem do catálogo de usuários ou da sessão. */
export function getReportAuthorLabel(
  item: { requester_id: string; author_name?: string | null },
  namesById: ReadonlyMap<string, string>,
  currentUser?: { id?: string; name?: string | null } | null,
): string {
  if (item.author_name) return item.author_name;
  const name = namesById.get(item.requester_id);
  if (name) return name;
  if (currentUser?.id === item.requester_id && currentUser.name) return currentUser.name;
  return "Usuário não encontrado";
}

export function formatReportDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("pt-BR");
}

export function getReportStatusConfig(status: ReportJobStatus) {
  switch (status) {
    case "completed":
      return { label: "Concluído", variant: "success" as const, icon: CheckCircle2 };
    case "processing":
      return { label: "Processando", variant: "info" as const, icon: Loader2 };
    case "queued":
      return { label: "Na fila", variant: "warning" as const, icon: Clock3 };
    case "cancelled":
      return { label: "Cancelado", variant: "neutral" as const, icon: CircleX };
    case "expired":
      return { label: "Expirado", variant: "orange" as const, icon: FileWarning };
    case "deleted":
      return { label: "Removido", variant: "neutral" as const, icon: Trash2 };
    default:
      return { label: "Falhou", variant: "danger" as const, icon: CircleX };
  }
}

export function getErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const response = (error as { response?: { status?: unknown } }).response;
  return typeof response?.status === "number" ? response.status : undefined;
}

export function isReportCsrfError(error: unknown): boolean {
  if (getErrorStatus(error) !== 403 || !error || typeof error !== "object") return false;
  const data = (error as { response?: { data?: unknown } }).response?.data;
  return (
    !!data &&
    typeof data === "object" &&
    (data as { error?: unknown }).error === "Requisição não autorizada."
  );
}

export function getReportForbiddenMessage(error: unknown, fallback: string): string {
  return isReportCsrfError(error)
    ? "Sua sessão de segurança expirou. Faça login novamente."
    : fallback;
}

export const reportInputClassName =
  "mt-1 block min-h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100";
