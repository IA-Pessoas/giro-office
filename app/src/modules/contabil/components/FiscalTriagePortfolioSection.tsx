import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FileDown, Printer, Search } from "lucide-react";

import { triagemCompetenceService } from "@modules/triagem/services/triagemCompetenceService";
import { useFetch } from "@shared/hooks";
import { formatCpfCnpjInput } from "@shared/utils/inputFormatting";

import { triageDocumentsService, getContabilErrorMessage } from "../services";
import type { ContabilCompetence, FiscalTriagePortfolioItem, TriageDocumentStatus } from "../types";
import { triageMonthlyQueryKey } from "../hooks/queryKeys";
import { getCurrentContabilCompetence } from "./contabilControlSection.helpers";
import { FISCAL_DOCUMENTS, STATUSES } from "./TriageDocumentsSection";

const PAGE_SIZE = 50;
const STATUS_LABELS = Object.fromEntries(STATUSES) as Record<TriageDocumentStatus, string>;

function cellStatus(row: FiscalTriagePortfolioItem, field: string) {
  return row.monthly?.checklist[field] ?? "NOT_STARTED";
}

function statusLabel(status: string) {
  return status === "NOT_STARTED"
    ? "Não iniciado"
    : (STATUS_LABELS[status as TriageDocumentStatus] ?? status);
}

function csvCell(value: string) {
  const safe = /^\s*[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

function exportCsv(competence: string, rows: FiscalTriagePortfolioItem[]) {
  const headers = [
    "Empresa",
    "CNPJ",
    "Regime",
    "Responsável",
    ...FISCAL_DOCUMENTS.map(([, label]) => label),
  ];
  const content = [
    headers,
    ...rows.map((row) => [
      row.legal_name,
      row.cpf_cnpj,
      row.regime ?? "",
      row.responsible_name ?? "",
      ...FISCAL_DOCUMENTS.map(([field]) => statusLabel(cellStatus(row, field))),
    ]),
  ]
    .map((line) => line.map(csvCell).join(","))
    .join("\r\n");
  const url = URL.createObjectURL(
    new Blob(["\uFEFF", content], { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `triagem-fiscal-${competence}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function printPortfolio(competence: string, rows: FiscalTriagePortfolioItem[]) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) return false;
  printWindow.document.open();
  printWindow.document.write(
    '<!doctype html><html lang="pt-BR"><head><title>Triagem Fiscal</title><style>@page{size:A3 landscape;margin:12mm}body{font:10px Arial,sans-serif}table{border-collapse:collapse;width:100%}th,td{border:1px solid #aaa;padding:4px;text-align:left}th{background:#eee}h1{font-size:18px}</style></head><body></body></html>',
  );
  printWindow.document.close();
  printWindow.document.title = `Triagem Fiscal ${competence}`;
  const title = printWindow.document.createElement("h1");
  title.textContent = `Triagem Fiscal · ${competence}`;
  printWindow.document.body.append(title);
  const table = printWindow.document.createElement("table");
  const columns = [
    "Empresa",
    "CNPJ",
    "Regime",
    "Responsável",
    ...FISCAL_DOCUMENTS.map(([, label]) => label),
  ];
  const head = printWindow.document.createElement("tr");
  for (const column of columns) {
    const cell = printWindow.document.createElement("th");
    cell.textContent = column;
    head.append(cell);
  }
  table.append(head);
  for (const row of rows) {
    const tr = printWindow.document.createElement("tr");
    const values = [
      row.legal_name,
      row.cpf_cnpj,
      row.regime ?? "",
      row.responsible_name ?? "",
      ...FISCAL_DOCUMENTS.map(([field]) => statusLabel(cellStatus(row, field))),
    ];
    for (const value of values) {
      const cell = printWindow.document.createElement("td");
      cell.textContent = value;
      tr.append(cell);
    }
    table.append(tr);
  }
  printWindow.document.body.append(table);
  printWindow.focus();
  printWindow.print();
  return true;
}

export function FiscalTriagePortfolioSection({
  canStartCompetence,
}: {
  canStartCompetence: boolean;
}) {
  const [competence, setCompetence] = useState<ContabilCompetence>(getCurrentContabilCompetence());
  const [search, setSearch] = useState("");
  const [responsible, setResponsible] = useState("");
  const [regime, setRegime] = useState("");
  const [documentField, setDocumentField] = useState<(typeof FISCAL_DOCUMENTS)[number][0]>(
    FISCAL_DOCUMENTS[0][0],
  );
  const [documentStatus, setDocumentStatus] = useState("");
  const [page, setPage] = useState(1);
  const [saving, setSaving] = useState("");
  const [actionError, setActionError] = useState("");
  const queryClient = useQueryClient();
  const portfolio = useFetch(["triagem", "fiscal-portfolio", competence], () =>
    triageDocumentsService.getFiscalPortfolio(competence),
  );
  const items = portfolio.data?.items ?? [];
  const responsibles = [
    ...new Set(items.map((row) => row.responsible_name ?? "Sem responsável")),
  ].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const regimes = [...new Set(items.map((row) => row.regime ?? "Não informado"))].sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );

  const filtered = useMemo(
    () =>
      items.filter((row) => {
        const query = search.trim().toLocaleLowerCase("pt-BR");
        if (
          query &&
          !`${row.legal_name} ${row.cpf_cnpj}`.toLocaleLowerCase("pt-BR").includes(query)
        )
          return false;
        if (responsible && (row.responsible_name ?? "Sem responsável") !== responsible)
          return false;
        if (regime && (row.regime ?? "Não informado") !== regime) return false;
        return !documentStatus || cellStatus(row, documentField) === documentStatus;
      }),
    [items, search, responsible, regime, documentField, documentStatus],
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice(
    (Math.min(page, totalPages) - 1) * PAGE_SIZE,
    Math.min(page, totalPages) * PAGE_SIZE,
  );
  const counts = responsibles
    .map((name) => ({
      name,
      count: filtered.filter((row) => (row.responsible_name ?? "Sem responsável") === name).length,
    }))
    .filter(({ count }) => count > 0);

  async function startMonthly(row: FiscalTriagePortfolioItem) {
    setSaving(row.client_id);
    setActionError("");
    try {
      if (!row.has_competence) await triagemCompetenceService.create(row.client_id, competence);
      await triageDocumentsService.createMonthly({
        clientId: row.client_id,
        competence,
        type: "FISCAL",
      });
      await portfolio.refetch();
    } catch (error) {
      setActionError(getContabilErrorMessage(error));
    } finally {
      setSaving("");
    }
  }

  async function updateStatus(
    row: FiscalTriagePortfolioItem,
    field: string,
    status: TriageDocumentStatus,
  ) {
    if (!row.monthly) return;
    setSaving(`${row.client_id}:${field}`);
    setActionError("");
    try {
      await triageDocumentsService.updateItem(row.monthly.id, field, status, undefined, "FISCAL");
      await Promise.all([
        portfolio.refetch(),
        queryClient.invalidateQueries({
          queryKey: triageMonthlyQueryKey(row.client_id, competence, "FISCAL"),
        }),
      ]);
    } catch (error) {
      setActionError(getContabilErrorMessage(error));
    } finally {
      setSaving("");
    }
  }

  function updateFilter(setter: (value: string) => void, value: string) {
    setter(value);
    setPage(1);
  }

  return (
    <section
      className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"
      aria-labelledby="fiscal-triage-portfolio-title"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2
            id="fiscal-triage-portfolio-title"
            className="text-lg font-semibold text-gray-900 dark:text-white"
          >
            Triagem Fiscal mensal
          </h2>
          <p className="text-sm text-gray-600 dark:text-slate-400">
            Empresas e documentos da competência, inclusive rotinas ainda não iniciadas.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm text-gray-700 dark:text-slate-300">
            Competência
            <input
              type="month"
              aria-label="Competência da Triagem Fiscal"
              value={competence}
              onChange={(event) => {
                setCompetence(event.target.value as ContabilCompetence);
                setPage(1);
              }}
              className="ml-2 rounded-lg border border-gray-300 bg-white px-2 py-1 dark:border-slate-600 dark:bg-slate-800"
            />
          </label>
          <button
            type="button"
            onClick={() => exportCsv(competence, filtered)}
            disabled={!filtered.length}
            className="inline-flex items-center gap-1 rounded-lg border px-3 py-1 text-sm disabled:opacity-50"
          >
            <FileDown className="h-4 w-4" /> CSV
          </button>
          <button
            type="button"
            onClick={() => {
              if (!printPortfolio(competence, filtered))
                setActionError("Permita a abertura da janela para salvar o PDF.");
            }}
            disabled={!filtered.length}
            className="inline-flex items-center gap-1 rounded-lg border px-3 py-1 text-sm disabled:opacity-50"
          >
            <Printer className="h-4 w-4" /> PDF
          </button>
        </div>
      </div>

      {portfolio.isLoading ? (
        <p role="status" className="text-sm text-gray-600">
          Carregando carteira fiscal...
        </p>
      ) : null}
      {portfolio.isError ? (
        <p role="alert" className="text-sm text-red-700">
          Não foi possível carregar a carteira fiscal. {getContabilErrorMessage(portfolio.error)}
        </p>
      ) : null}
      {actionError ? (
        <p role="alert" className="text-sm text-red-700">
          {actionError}
        </p>
      ) : null}
      {!portfolio.isLoading && !portfolio.isError ? (
        <>
          <div className="flex flex-wrap gap-2" aria-label="Empresas por responsável">
            {counts.map(({ name, count }) => (
              <div
                key={name}
                className="min-w-32 rounded-lg border border-gray-200 p-3 dark:border-slate-700"
              >
                <strong className="block text-xl text-gray-900 dark:text-white">{count}</strong>
                <span className="text-xs text-gray-600 dark:text-slate-400">{name}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-2 text-sm">
            <label className="flex items-center gap-1 rounded-lg border border-gray-300 px-2 dark:border-slate-600">
              <Search className="h-4 w-4" aria-hidden="true" />
              <input
                aria-label="Buscar empresa ou CNPJ"
                placeholder="Buscar empresa ou CNPJ"
                value={search}
                onChange={(event) => updateFilter(setSearch, event.target.value)}
                className="w-56 bg-transparent py-2 outline-none"
              />
            </label>
            <select
              aria-label="Filtrar responsável"
              value={responsible}
              onChange={(event) => updateFilter(setResponsible, event.target.value)}
              className="rounded-lg border px-2 py-2 dark:bg-slate-800"
            >
              <option value="">Todos os responsáveis</option>
              {responsibles.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
            <select
              aria-label="Filtrar regime"
              value={regime}
              onChange={(event) => updateFilter(setRegime, event.target.value)}
              className="rounded-lg border px-2 py-2 dark:bg-slate-800"
            >
              <option value="">Todos os regimes</option>
              {regimes.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
            <select
              aria-label="Documento para filtrar"
              value={documentField}
              onChange={(event) =>
                updateFilter(setDocumentField as (value: string) => void, event.target.value)
              }
              className="rounded-lg border px-2 py-2 dark:bg-slate-800"
            >
              {FISCAL_DOCUMENTS.map(([field, label]) => (
                <option key={field} value={field}>
                  {label}
                </option>
              ))}
            </select>
            <select
              aria-label="Filtrar status documental"
              value={documentStatus}
              onChange={(event) => updateFilter(setDocumentStatus, event.target.value)}
              className="rounded-lg border px-2 py-2 dark:bg-slate-800"
            >
              <option value="">Todos os status</option>
              <option value="NOT_STARTED">Não iniciado</option>
              {STATUSES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <span className="text-gray-600 dark:text-slate-400">{filtered.length} empresas</span>
          </div>
          {filtered.length === 0 ? (
            <p className="text-sm text-gray-600 dark:text-slate-400">
              Nenhuma empresa encontrada nesta competência.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-slate-700">
              <table className="min-w-max border-collapse text-left text-xs">
                <caption className="sr-only">Status dos documentos fiscais por empresa</caption>
                <thead className="bg-gray-50 dark:bg-slate-800">
                  <tr>
                    <th
                      scope="col"
                      className="sticky left-0 z-10 min-w-56 bg-gray-50 px-3 py-2 dark:bg-slate-800"
                    >
                      Empresa
                    </th>
                    <th scope="col" className="px-3 py-2">
                      CNPJ
                    </th>
                    <th scope="col" className="px-3 py-2">
                      Regime
                    </th>
                    <th scope="col" className="px-3 py-2">
                      Responsável
                    </th>
                    {FISCAL_DOCUMENTS.map(([field, label]) => (
                      <th key={field} scope="col" className="max-w-28 whitespace-normal px-2 py-2">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => (
                    <tr
                      key={row.client_id}
                      className="border-t border-gray-200 dark:border-slate-700"
                    >
                      <th
                        scope="row"
                        className="sticky left-0 bg-white px-3 py-2 text-left font-medium dark:bg-slate-900"
                      >
                        {row.legal_name}
                        {!row.monthly &&
                        row.can_edit &&
                        (row.has_competence || canStartCompetence) ? (
                          <button
                            type="button"
                            disabled={Boolean(saving)}
                            onClick={() => void startMonthly(row)}
                            className="ml-2 text-xs text-blue-700 underline disabled:opacity-50 dark:text-blue-300"
                          >
                            Iniciar
                          </button>
                        ) : null}
                      </th>
                      <td className="px-3 py-2">{formatCpfCnpjInput(row.cpf_cnpj)}</td>
                      <td className="px-3 py-2">{row.regime ?? "—"}</td>
                      <td className="px-3 py-2">{row.responsible_name ?? "Sem responsável"}</td>
                      {FISCAL_DOCUMENTS.map(([field, label]) => (
                        <td key={field} className="px-2 py-2">
                          {row.monthly && row.can_edit ? (
                            <select
                              aria-label={`${row.legal_name}: ${label}`}
                              value={row.monthly.checklist[field]}
                              disabled={Boolean(saving)}
                              onChange={(event) =>
                                void updateStatus(
                                  row,
                                  field,
                                  event.target.value as TriageDocumentStatus,
                                )
                              }
                              className="max-w-28 rounded border border-gray-300 bg-white px-1 py-1 dark:border-slate-600 dark:bg-slate-800"
                            >
                              {STATUSES.map(([value, text]) => (
                                <option key={value} value={value}>
                                  {text}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span>{statusLabel(cellStatus(row, field))}</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {totalPages > 1 ? (
            <div className="flex items-center justify-end gap-3 text-sm">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className="disabled:opacity-50"
              >
                Anterior
              </button>
              <span>
                Página {Math.min(page, totalPages)} de {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
                className="disabled:opacity-50"
              >
                Próxima
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
