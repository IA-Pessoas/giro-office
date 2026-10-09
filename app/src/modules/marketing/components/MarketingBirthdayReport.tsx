import { useState } from "react";
import { Cake, Download, Printer } from "lucide-react";

import { Dialog } from "@shared/components";

import { useMarketingMonthlyBirthdays } from "../hooks/useMarketingDashboard";
import type { MarketingMonthlyBirthdays } from "../types/marketingDashboard";
import {
  createMonthlyClientBirthdayCsv,
  createMonthlyEmployeeBirthdayCsv,
  formatBirthDate,
} from "../utils/birthdayCsv";
import { marketingPrimaryButtonClass, marketingSecondaryButtonClass } from "./marketingButtonStyles";
import { marketingFormControlClass } from "./marketingFormStyles";

const MONTHS = Array.from({ length: 12 }, (_, index) =>
  new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(2000, index, 1)),
  ),
);

function downloadCsv(filename: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function printReport() {
  const report = document.getElementById("marketing-birthday-report");
  for (let element = report; element; element = element.parentElement) element.scrollTop = 0;
  window.scrollTo(0, 0);
  window.print();
}

function BirthdayTable({
  title,
  columns,
  rows,
}: {
  title: string;
  columns: [string, string, string];
  rows: Array<{ id: string; cells: [string, string, string] }>;
}) {
  return (
    <section aria-label={title} className="space-y-2">
      <h3 className="font-semibold text-gray-900 dark:text-white">
        {title} · {rows.length} {rows.length === 1 ? "registro" : "registros"}
      </h3>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-slate-400">Nenhum aniversariante neste mês.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 text-gray-600 dark:border-slate-700 dark:text-slate-300">
              <tr>
                {columns.map((column) => (
                  <th className="py-2 pr-3 font-medium" key={column} scope="col">{column}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-gray-800 dark:divide-slate-700 dark:text-slate-100">
              {rows.map((row) => (
                <tr key={row.id}>
                  {row.cells.map((cell, index) => (
                    <td className="py-2 pr-3" key={columns[index]}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function BirthdayReportContent({ report }: { report: MarketingMonthlyBirthdays }) {
  const monthName = MONTHS[report.month - 1];
  const slug = String(report.month).padStart(2, "0");
  return (
    <article
      aria-label={`Aniversariantes de ${monthName}`}
      className="space-y-6 text-gray-900 dark:text-slate-100"
      id="marketing-birthday-report"
    >
      <div className="hide-on-print flex flex-wrap justify-end gap-2">
        <button
          className={marketingSecondaryButtonClass}
          disabled={report.employees.total === 0}
          onClick={() =>
            downloadCsv(
              `aniversarios-colaboradores-${slug}.csv`,
              createMonthlyEmployeeBirthdayCsv(report.employees.items),
            )
          }
          type="button"
        >
          <Download aria-hidden="true" className="mr-1.5 inline h-4 w-4" />
          CSV colaboradores
        </button>
        <button
          className={marketingSecondaryButtonClass}
          disabled={report.clients.total === 0}
          onClick={() =>
            downloadCsv(
              `aniversarios-clientes-${slug}.csv`,
              createMonthlyClientBirthdayCsv(report.clients.items),
            )
          }
          type="button"
        >
          <Download aria-hidden="true" className="mr-1.5 inline h-4 w-4" />
          CSV clientes
        </button>
        <button className={marketingPrimaryButtonClass} onClick={printReport} type="button">
          <Printer aria-hidden="true" className="h-4 w-4" />
          Imprimir relatório
        </button>
      </div>

      <header className="border-b border-gray-200 pb-4 dark:border-slate-700">
        <p className="text-sm text-gray-600 dark:text-slate-300">Relatório de aniversariantes</p>
        <h2 className="text-xl font-semibold capitalize">{monthName}</h2>
      </header>

      <BirthdayTable
        columns={["Data", "Colaborador", "Departamento"]}
        rows={report.employees.items.map((item) => ({
          id: item.id,
          cells: [formatBirthDate(item.birthDate), item.name, item.department ?? "Sem departamento"],
        }))}
        title="Colaboradores"
      />
      <BirthdayTable
        columns={["Data", "Cliente", "Empresa"]}
        rows={report.clients.items.map((item) => ({
          id: item.id,
          cells: [formatBirthDate(item.birthDate), item.name, item.companies],
        }))}
        title="Clientes PF vinculados a empresas ativas"
      />
    </article>
  );
}

export function MarketingBirthdayReport() {
  const [month, setMonth] = useState(() => new Date().getMonth() + 1);
  const [open, setOpen] = useState(false);
  const query = useMarketingMonthlyBirthdays(month, open);

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-4 flex items-center gap-2">
        <Cake aria-hidden="true" className="h-4 w-4 text-blue-600 dark:text-blue-300" />
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Aniversariantes do mês</h2>
          <p className="text-sm text-gray-500 dark:text-slate-400">
            Mês inteiro, com tela, impressão e CSV a partir da mesma consulta.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label
          className="block space-y-1.5 text-sm font-medium text-gray-700 dark:text-slate-200"
          htmlFor="marketing-birthday-month"
        >
          Mês
          <select
            className={`${marketingFormControlClass} capitalize`}
            id="marketing-birthday-month"
            onChange={(event) => setMonth(Number(event.target.value))}
            value={month}
          >
            {MONTHS.map((name, index) => (
              <option key={name} value={index + 1}>{name}</option>
            ))}
          </select>
        </label>
        <button className={marketingPrimaryButtonClass} onClick={() => setOpen(true)} type="button">
          Abrir relatório
        </button>
      </div>

      <Dialog
        contentClassName="w-[min(96vw,900px)]"
        description="Colaboradores ativos e clientes PF vinculados a empresas ativas"
        onOpenChange={setOpen}
        open={open}
        title="Aniversariantes do mês"
      >
        {query.isLoading ? (
          <p className="text-sm text-gray-600 dark:text-slate-300" role="status">Carregando aniversariantes…</p>
        ) : null}
        {query.isError ? (
          <div className="space-y-3" role="alert">
            <p className="text-sm text-red-700 dark:text-red-300">Não foi possível carregar os aniversariantes.</p>
            <button className={marketingSecondaryButtonClass} onClick={() => void query.refetch()} type="button">
              Tentar novamente
            </button>
          </div>
        ) : null}
        {query.data ? <BirthdayReportContent report={query.data} /> : null}
      </Dialog>
    </section>
  );
}
