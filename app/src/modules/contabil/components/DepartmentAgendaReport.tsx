import { useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { CalendarDays, Printer } from "lucide-react";

import { Dialog } from "@shared/components";
import { agendaService } from "@shared/services/agendaService";
import type { AgendaModule } from "@shared/services/agendaService.contract";
import { Input } from "@shared/ui/newLayout/input";
import { formatCivilDate, formatDateTime } from "@shared/utils/dateFormat";
import { printReport } from "@shared/utils/printReport";

import { departmentAgendaQueryKey } from "../hooks/queryKeys";
import { getContabilErrorMessage } from "../services/contabilError";
import { ContabilStateBox } from "./ContabilStateBox";
import { getCurrentContabilCompetence } from "./contabilControlSection.helpers";
import { CONTABIL_OUTLINE_ACTION_CLASS } from "./contabilUiClasses";
import {
  AGENDA_REPORT_MAX_MONTHS,
  agendaReportEvents,
  agendaReportMonths,
} from "./departmentAgendaReport.helpers";

const HEAD_CELL_CLASS = "py-2 pr-3 font-medium";
const CELL_CLASS = "break-words py-2 pr-3 align-top";

/** Primeiro e último dia do mês corrente, no formato dos campos de data. */
function currentMonthInterval(): { from: string; to: string } {
  const month = getCurrentContabilCompetence();
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, "0")}` };
}

interface DepartmentAgendaReportProps {
  module: AgendaModule;
  /** Nome do departamento nos textos do relatório. */
  departmentLabel: string;
  /** Agenda com responsável e cliente: as duas colunas entram no relatório. */
  assignable?: boolean;
}

/**
 * Relatório imprimível da agenda de um departamento em um intervalo de dias. Lê os mesmos
 * eventos da tela, pelo mesmo cache mensal (sem o filtro "Minha agenda"); só o
 * `<article class="print-report">` sai na impressão (`@media print` em `global.css`).
 */
export function DepartmentAgendaReport({
  module,
  departmentLabel,
  assignable = false,
}: DepartmentAgendaReportProps) {
  const reportId = `${module}-agenda-report`;
  const [open, setOpen] = useState(false);
  const [issuedAt, setIssuedAt] = useState("");
  const [{ from, to }, setRange] = useState(currentMonthInterval);
  const months = agendaReportMonths(from, to);
  const intervalError =
    months.length === 0
      ? "Informe um intervalo com a data inicial até a final."
      : months.length > AGENDA_REPORT_MAX_MONTHS
        ? `O intervalo pode ter até ${AGENDA_REPORT_MAX_MONTHS} meses.`
        : null;
  const monthly = useQueries({
    queries: (intervalError === null ? months : []).map((month) => ({
      queryKey: departmentAgendaQueryKey(module, month, false),
      queryFn: () => agendaService.list(module, month),
      enabled: open,
    })),
  });
  const failed = monthly.find((query) => query.isError);
  const isLoading = monthly.some((query) => query.isLoading);
  const rows =
    intervalError === null && monthly.every((query) => query.data)
      ? agendaReportEvents(
          monthly.flatMap((query) => query.data ?? []),
          from,
          to,
        )
      : undefined;
  // O serviço só gera as ocorrências mensais até o mês corrente.
  const reachesFuture = to.slice(0, 7) > getCurrentContabilCompetence();

  function handleOpenChange(next: boolean) {
    if (next) setIssuedAt(formatDateTime(new Date()));
    setOpen(next);
  }

  return (
    <>
      <button
        type="button"
        className={CONTABIL_OUTLINE_ACTION_CLASS}
        onClick={() => handleOpenChange(true)}
      >
        <Printer className="h-4 w-4" aria-hidden="true" />
        Imprimir agenda
      </button>

      <Dialog
        contentClassName="w-[min(96vw,900px)]"
        description={`Eventos do departamento ${departmentLabel} em um intervalo de datas.`}
        onOpenChange={handleOpenChange}
        open={open}
        title="Relatório da agenda"
      >
        <article
          aria-label={`Relatório da agenda do departamento ${departmentLabel}`}
          aria-busy={monthly.some((query) => query.isFetching)}
          className="print-report space-y-5 text-gray-900 dark:text-slate-100"
          id={reportId}
        >
          <div className="hide-on-print flex flex-wrap items-end gap-3">
            <label className="space-y-1 text-sm font-medium text-gray-700 dark:text-slate-300">
              De
              <Input
                type="date"
                value={from}
                max={to || undefined}
                onChange={(event) => setRange({ from: event.target.value, to })}
              />
            </label>
            <label className="space-y-1 text-sm font-medium text-gray-700 dark:text-slate-300">
              Até
              <Input
                type="date"
                value={to}
                min={from || undefined}
                onChange={(event) => setRange({ from, to: event.target.value })}
              />
            </label>
            <button
              type="button"
              className={CONTABIL_OUTLINE_ACTION_CLASS}
              onClick={() => printReport(reportId)}
              disabled={!rows?.length}
            >
              <Printer className="h-4 w-4" aria-hidden="true" />
              Imprimir
            </button>
          </div>

          <header className="space-y-1 border-b border-gray-300 pb-4 dark:border-slate-600">
            <h2 className="text-xl font-semibold uppercase">Agenda {departmentLabel}</h2>
            <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              <div>
                <dt className="font-medium">Período</dt>
                <dd>
                  {formatCivilDate(from, "-")} a {formatCivilDate(to, "-")}
                </dd>
              </div>
              <div>
                <dt className="font-medium">Data de emissão</dt>
                <dd>{issuedAt}</dd>
              </div>
            </dl>
          </header>

          {intervalError ? (
            <ContabilStateBox icon={CalendarDays} title="Intervalo inválido" tone="danger">
              {intervalError}
            </ContabilStateBox>
          ) : failed ? (
            <ContabilStateBox
              icon={CalendarDays}
              title="Não foi possível carregar a agenda"
              tone="danger"
            >
              {getContabilErrorMessage(failed.error)}
            </ContabilStateBox>
          ) : isLoading ? (
            <ContabilStateBox icon={CalendarDays} title="Carregando agenda..." tone="loading">
              Buscando os eventos do período.
            </ContabilStateBox>
          ) : !rows?.length ? (
            <ContabilStateBox icon={CalendarDays} title="Nenhum evento no período">
              Ajuste o intervalo para incluir outros dias.
            </ContabilStateBox>
          ) : (
            <table className="w-full table-fixed text-left text-sm">
              <thead className="border-b border-gray-300 dark:border-slate-600">
                <tr>
                  <th scope="col" className={`w-24 ${HEAD_CELL_CLASS}`}>
                    Data
                  </th>
                  <th scope="col" className={HEAD_CELL_CLASS}>
                    Título
                  </th>
                  <th scope="col" className={HEAD_CELL_CLASS}>
                    Assunto
                  </th>
                  {assignable && (
                    <>
                      <th scope="col" className={HEAD_CELL_CLASS}>
                        Cliente
                      </th>
                      <th scope="col" className={HEAD_CELL_CLASS}>
                        Responsável
                      </th>
                    </>
                  )}
                  <th scope="col" className={`w-24 ${HEAD_CELL_CLASS}`}>
                    Estado
                  </th>
                  <th scope="col" className={`w-24 ${HEAD_CELL_CLASS}`}>
                    Repetição
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                {rows.map((event) => (
                  <tr key={event.id}>
                    <td className={CELL_CLASS}>{formatCivilDate(event.date)}</td>
                    <td className={CELL_CLASS}>{event.agenda}</td>
                    <td className={CELL_CLASS}>{event.obs ?? "-"}</td>
                    {assignable && (
                      <>
                        <td className={CELL_CLASS}>{event.client?.name ?? "-"}</td>
                        <td className={CELL_CLASS}>
                          {event.participant?.name ?? "Sem responsável"}
                        </td>
                      </>
                    )}
                    <td className={CELL_CLASS}>{event.status ?? "Sem estado"}</td>
                    <td className={CELL_CLASS}>{event.recurring_agenda_id ? "Mensal" : "-"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="pt-3 text-sm font-medium" colSpan={assignable ? 7 : 5}>
                    {rows.length === 1 ? "1 evento" : `${rows.length} eventos`}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
          {reachesFuture && intervalError === null && (
            <p className="text-sm text-gray-600 dark:text-slate-400">
              Eventos que se repetem todo mês só aparecem a partir do mês em que são gerados: os
              meses futuros do período podem não listar essas repetições.
            </p>
          )}
        </article>
      </Dialog>
    </>
  );
}
