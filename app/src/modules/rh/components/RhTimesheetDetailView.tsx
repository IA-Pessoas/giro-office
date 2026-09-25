import { Download, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "@shared/services/toast";

import {
  useDownloadRhTimeSheetPdfMutation,
  useRhTimeSheetDetail,
} from "../hooks/useRhCalendar";
import { formatRhDate, formatRhDateTime, formatRhTime } from "../utils/rhDate";
import { formatRhDuration } from "../utils/rhDuration";

type TimesheetDayFilter = "all" | "records" | "absent" | "incomplete";

interface RhTimesheetDetailViewProps {
  timesheetId: string | null;
  enabled?: boolean;
  initialFilter?: TimesheetDayFilter;
  mode?: "dialog" | "page";
}

function hasRecordedTime(day: {
  clock_in: string | null;
  lunch_out: string | null;
  lunch_in: string | null;
  clock_out: string | null;
}) {
  return Boolean(day.clock_in || day.lunch_out || day.lunch_in || day.clock_out);
}

function getStatusLabel(status: string) {
  switch (status) {
    case "Nao previsto":
    case "Não previsto":
      return "Sem expediente";
    default:
      return status;
  }
}

function getStatusBadgeClassName(status: string) {
  switch (status) {
    case "Completo":
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300";
    case "Incompleto":
      return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300";
    case "Ausente":
      return "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300";
    case "Nao previsto":
    case "Não previsto":
      return "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200";
    default:
      return "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200";
  }
}

export function RhTimesheetDetailView({
  timesheetId,
  enabled = true,
  initialFilter = "records",
  mode = "dialog",
}: RhTimesheetDetailViewProps) {
  const isFullPage = mode === "page";
  const detailQuery = useRhTimeSheetDetail(timesheetId, enabled);
  const downloadPdfMutation = useDownloadRhTimeSheetPdfMutation();
  const [dayFilter, setDayFilter] = useState<TimesheetDayFilter>(initialFilter);

  useEffect(() => {
    setDayFilter(initialFilter);
  }, [initialFilter, timesheetId]);

  const totals = useMemo(() => detailQuery.data?.totals ?? null, [detailQuery.data]);
  const days = detailQuery.data?.days ?? [];
  const dayCounters = useMemo(() => {
    return days.reduce(
      (accumulator, day) => {
        if (hasRecordedTime(day)) {
          accumulator.records += 1;
        }
        if (day.status === "Ausente") {
          accumulator.absent += 1;
        }
        if (day.status === "Incompleto") {
          accumulator.incomplete += 1;
        }
        return accumulator;
      },
      { records: 0, absent: 0, incomplete: 0 },
    );
  }, [days]);
  const filteredDays = useMemo(() => {
    switch (dayFilter) {
      case "records":
        return days.filter((day) => hasRecordedTime(day));
      case "absent":
        return days.filter((day) => day.status === "Ausente");
      case "incomplete":
        return days.filter((day) => day.status === "Incompleto");
      default:
        return days;
    }
  }, [dayFilter, days]);
  const hasNonWorkingDays = useMemo(
    () => days.some((day) => day.status === "Nao previsto" || day.status === "Não previsto"),
    [days],
  );

  const containerClassName =
    isFullPage
      ? "rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800"
      : "rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800";

  async function handleDownloadPdf() {
    if (!timesheetId) return;
    try {
      const result = await downloadPdfMutation.mutateAsync(timesheetId);
      const objectUrl = URL.createObjectURL(result.blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = result.filename;
      anchor.click();
      URL.revokeObjectURL(objectUrl);
      toast.success("PDF da folha pronto para download.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível baixar o PDF.");
    }
  }

  if (detailQuery.isLoading) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 p-5 text-sm text-gray-600 dark:border-gray-700 dark:text-gray-300">
        Carregando detalhe da folha...
      </div>
    );
  }

  if (detailQuery.error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/10 dark:text-red-300">
        Não foi possível carregar o detalhe da folha de ponto.
      </div>
    );
  }

  if (!detailQuery.data) {
    return null;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">
            Snapshot autorizado
          </p>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
            O PDF contém os registros, totais, banco de horas e assinatura da folha.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleDownloadPdf()}
          disabled={!timesheetId || downloadPdfMutation.isPending}
          className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 px-3 py-2 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-blue-900/40 dark:text-blue-300 dark:hover:bg-blue-900/20"
        >
          {downloadPdfMutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
          {downloadPdfMutation.isPending ? "Preparando PDF..." : "Baixar PDF"}
        </button>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-700/30">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">
            Início
          </p>
          <p className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
            {formatRhDateTime(detailQuery.data.start_time)}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-700/30">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">
            Fim
          </p>
          <p className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
            {formatRhDateTime(detailQuery.data.end_time)}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-700/30">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">
            Trabalhado
          </p>
          <p className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
            {totals ? formatRhDuration(totals.worked_minutes) : "-"}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-700/30">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">
            Esperado
          </p>
          <p className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
            {totals ? formatRhDuration(totals.expected_minutes) : "-"}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-700/30">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">
            Saldo
          </p>
          <p className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
            {totals
              ? formatRhDuration(totals.balance_minutes, { showPositiveSign: true })
              : "-"}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-700/30">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">
            Banco de horas
          </p>
          <p className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
            {totals
              ? formatRhDuration(totals.bank_balance_minutes, { showPositiveSign: true })
              : "-"}
          </p>
        </div>
      </div>

      <div className={containerClassName}>
        <div className="space-y-4 border-b border-gray-200 px-4 py-3 dark:border-gray-700">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              Dias consolidados
            </h3>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setDayFilter("records")}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  dayFilter === "records"
                    ? "bg-blue-600 text-white"
                    : "bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-300"
                }`}
              >
                Com registro ({dayCounters.records})
              </button>
              <button
                type="button"
                onClick={() => setDayFilter("absent")}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  dayFilter === "absent"
                    ? "bg-rose-600 text-white"
                    : "bg-rose-50 text-rose-700 hover:bg-rose-100 dark:bg-rose-900/20 dark:text-rose-300"
                }`}
              >
                Ausentes ({dayCounters.absent})
              </button>
              <button
                type="button"
                onClick={() => setDayFilter("incomplete")}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  dayFilter === "incomplete"
                    ? "bg-amber-500 text-white"
                    : "bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-900/20 dark:text-amber-300"
                }`}
              >
                Incompletos ({dayCounters.incomplete})
              </button>
              {isFullPage ? (
                <button
                  type="button"
                  onClick={() => setDayFilter("all")}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    dayFilter === "all"
                      ? "bg-slate-700 text-white dark:bg-slate-200 dark:text-slate-900"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200"
                  }`}
                >
                  Todos ({days.length})
                </button>
              ) : null}
            </div>
          </div>

          {!isFullPage && hasNonWorkingDays ? (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              <strong>Sem expediente</strong> indica dias fora da jornada prevista.
            </p>
          ) : null}
        </div>

        {days.length === 0 ? (
          <div className="p-5 text-sm text-gray-600 dark:text-gray-300">
            Esta folha não possui dias consolidados para exibição.
          </div>
        ) : filteredDays.length === 0 ? (
          <div className="p-5 text-sm text-gray-600 dark:text-gray-300">
            Nenhum dia encontrado para o filtro selecionado.
          </div>
        ) : (
          <div className="overflow-x-auto u-scrollbar-system">
            <table className="w-full min-w-[920px] divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-700/50">
                <tr>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-700 dark:text-gray-300">
                    Data
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-700 dark:text-gray-300">
                    Entrada
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-700 dark:text-gray-300">
                    Saída almoço
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-700 dark:text-gray-300">
                    Volta almoço
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-700 dark:text-gray-300">
                    Saída
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-700 dark:text-gray-300">
                    Trabalhado
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-700 dark:text-gray-300">
                    Esperado
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-700 dark:text-gray-300">
                    Saldo
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-700 dark:text-gray-300">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {filteredDays.map((day) => (
                  <tr
                    key={`${day.date}-${day.status}`}
                    className={`hover:bg-gray-50 dark:hover:bg-gray-700/30 ${
                      hasRecordedTime(day) ? "" : "opacity-80"
                    }`}
                  >
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                      {formatRhDate(day.date)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                      {formatRhTime(day.clock_in)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                      {formatRhTime(day.lunch_out)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                      {formatRhTime(day.lunch_in)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                      {formatRhTime(day.clock_out)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                      {formatRhDuration(day.worked_minutes)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                      {formatRhDuration(day.expected_minutes)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                      {formatRhDuration(day.balance_minutes, { showPositiveSign: true })}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${getStatusBadgeClassName(
                          day.status,
                        )}`}
                      >
                        {getStatusLabel(day.status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
