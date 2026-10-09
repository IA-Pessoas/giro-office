import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CalendarDays, FileDown, Loader2, Printer, RotateCcw, Search } from "lucide-react";

import {
  filterFiscalTriagePortfolio,
  fiscalTriagePortfolioItemStatus,
  TRIAGE_PORTFOLIO_NO_DELIVERY_METHOD,
  TRIAGE_PORTFOLIO_NO_REGIME,
  TRIAGE_PORTFOLIO_NO_RESPONSIBLE,
  type TriagePortfolioDocumentStatus,
  type TriagePortfolioJustificationFilter,
  type TriagePortfolioPriorityFilter,
} from "@workspace/shared/triagem/portfolioFilters";

import { useTriageCatalogs } from "@modules/triagem";
import { triagemCompetenceService } from "@modules/triagem/services/triagemCompetenceService";
import { PaginationControls } from "@shared/components";
import { useFetch } from "@shared/hooks";
import { formatCpfCnpjInput } from "@shared/utils/inputFormatting";

import { triageDocumentsService, getContabilErrorMessage } from "../services";
import type { ContabilCompetence, FiscalTriagePortfolioItem, TriageDocumentStatus, TriageFiscalChecklistField } from "../types";
import { triageFiscalPortfolioQueryKey, triageMonthlyQueryKey } from "../hooks/queryKeys";
import { getCurrentContabilCompetence } from "./contabilControlSection.helpers";
import { ContabilCompetenceSelect, CONTABIL_SELECT_CLASS } from "./ContabilCompetenceSelect";
import { ContabilStateBox } from "./ContabilStateBox";
import { FISCAL_DOCUMENTS, STATUSES } from "./TriageDocumentsSection";
import { CONTABIL_OUTLINE_ACTION_CLASS, CONTABIL_TABLE_FILTER_CLASS } from "./contabilUiClasses";

const PAGE_SIZE = 50;
const STATUS_LABELS = Object.fromEntries(STATUSES) as Record<TriageDocumentStatus, string>;


function statusLabel(status: string) {
  return status === "NOT_STARTED"
    ? "A configurar"
    : (STATUS_LABELS[status as TriageDocumentStatus] ?? status);
}

function csvCell(value: string) {
  const safe = /^\s*[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

type DeliveryLabel = (code: string | null) => string;

function exportTable(rows: FiscalTriagePortfolioItem[], deliveryLabel: DeliveryLabel) {
  return [
    [
      "Empresa",
      "CNPJ",
      "Regime",
      "Responsável",
      "Prioridade",
      "Meio de envio",
      ...FISCAL_DOCUMENTS.map(([, label]) => label),
    ],
    ...rows.map((row) => [
      row.legal_name,
      row.cpf_cnpj,
      row.regime ?? "",
      row.responsible_name ?? "",
      row.priority ? "Sim" : "Não",
      deliveryLabel(row.delivery_method),
      ...FISCAL_DOCUMENTS.map(([field]) => statusLabel(fiscalTriagePortfolioItemStatus(row, field))),
    ]),
  ];
}

function exportCsv(
  competence: string,
  rows: FiscalTriagePortfolioItem[],
  deliveryLabel: DeliveryLabel,
) {
  const content = exportTable(rows, deliveryLabel)
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

function printPortfolio(
  competence: string,
  rows: FiscalTriagePortfolioItem[],
  deliveryLabel: DeliveryLabel,
) {
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
  const [columns, ...bodyRows] = exportTable(rows, deliveryLabel);
  const head = printWindow.document.createElement("tr");
  for (const column of columns) {
    const cell = printWindow.document.createElement("th");
    cell.textContent = column;
    head.append(cell);
  }
  table.append(head);
  for (const values of bodyRows) {
    const tr = printWindow.document.createElement("tr");
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
  const [documentField, setDocumentField] = useState<TriageFiscalChecklistField>(
    FISCAL_DOCUMENTS[0][0],
  );
  const [documentStatus, setDocumentStatus] = useState<TriagePortfolioDocumentStatus | "">("");
  const [justification, setJustification] = useState<TriagePortfolioJustificationFilter | "">("");
  const [priority, setPriority] = useState<TriagePortfolioPriorityFilter | "">("");
  const [deliveryMethod, setDeliveryMethod] = useState("");
  const deliveryMethods = useTriageCatalogs("DELIVERY_METHOD");
  const deliveryLabels = new Map(
    (deliveryMethods.data ?? []).map((item) => [item.code, item.label]),
  );
  const deliveryLabel = (code: string | null) =>
    code ? (deliveryLabels.get(code) ?? code) : "Não informado";
  const [page, setPage] = useState(1);
  const [saving, setSaving] = useState("");
  const [actionError, setActionError] = useState("");
  const queryClient = useQueryClient();
  const portfolio = useFetch(triageFiscalPortfolioQueryKey(competence), () =>
    triageDocumentsService.getFiscalPortfolio(competence),
  );
  const items = portfolio.data?.items ?? [];
  // Filtro pelo id: dois responsáveis homônimos continuam distintos, como no endpoint.
  const responsibles = [
    ...new Map(
      items.map((row) => [
        row.responsible_id || TRIAGE_PORTFOLIO_NO_RESPONSIBLE,
        row.responsible_name ?? "Sem responsável",
      ]),
    ),
  ]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const regimes = [...new Set(items.map((row) => row.regime || TRIAGE_PORTFOLIO_NO_REGIME))].sort(
    (a, b) => a.localeCompare(b, "pt-BR"),
  );

  // Mesma função do GET /triagem/fiscal-portfolio: tela, CSV e consulta veem o mesmo conjunto.
  const filtered = useMemo(
    () =>
      filterFiscalTriagePortfolio(items, {
        search,
        responsibleId: responsible,
        regime,
        documentField,
        documentStatus: documentStatus || undefined,
        justification: justification || undefined,
        priority: priority || undefined,
        deliveryMethod,
      }),
    [
      items,
      search,
      responsible,
      regime,
      documentField,
      documentStatus,
      justification,
      priority,
      deliveryMethod,
    ],
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice(
    (Math.min(page, totalPages) - 1) * PAGE_SIZE,
    Math.min(page, totalPages) * PAGE_SIZE,
  );
  const counts = responsibles
    .map(({ id, name }) => ({
      id,
      name,
      count: filtered.filter(
        (row) => (row.responsible_id || TRIAGE_PORTFOLIO_NO_RESPONSIBLE) === id,
      ).length,
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
    field: TriageFiscalChecklistField,
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
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2
            id="fiscal-triage-portfolio-title"
            className="text-lg font-semibold text-gray-900 dark:text-white"
          >
            Triagem Fiscal mensal
          </h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">
            Empresas e documentos da competência, inclusive rotinas ainda não iniciadas.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-slate-300">
            <CalendarDays aria-hidden="true" className="h-4 w-4 text-blue-600 dark:text-blue-300" />
            Competência
            <ContabilCompetenceSelect
              value={competence}
              label="Competência da Triagem Fiscal"
              onChange={(value) => {
                setCompetence(value);
                setPage(1);
              }}
            />
          </div>
          <button
            type="button"
            onClick={() => exportCsv(competence, filtered, deliveryLabel)}
            disabled={!filtered.length}
            className={CONTABIL_OUTLINE_ACTION_CLASS}
          >
            <FileDown aria-hidden="true" className="h-4 w-4" /> CSV
          </button>
          <button
            type="button"
            onClick={() => {
              if (!printPortfolio(competence, filtered, deliveryLabel))
                setActionError("Permita a abertura da janela para salvar o PDF.");
            }}
            disabled={!filtered.length}
            className={CONTABIL_OUTLINE_ACTION_CLASS}
          >
            <Printer aria-hidden="true" className="h-4 w-4" /> Imprimir / PDF
          </button>
        </div>
      </div>

      {portfolio.isLoading ? (
        <ContabilStateBox icon={Loader2} tone="loading" title="Carregando carteira fiscal" compact>
          Buscando empresas e documentos desta competência.
        </ContabilStateBox>
      ) : null}
      {portfolio.isError ? (
        <ContabilStateBox icon={AlertCircle} tone="danger" title="Não foi possível carregar a carteira fiscal" compact>
          {getContabilErrorMessage(portfolio.error)}
          <button
            type="button"
            onClick={() => void portfolio.refetch()}
            className="mt-3 inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold hover:bg-red-100 dark:border-red-900/50 dark:hover:bg-red-900/30"
          >
            <RotateCcw aria-hidden="true" className="h-4 w-4" /> Tentar novamente
          </button>
        </ContabilStateBox>
      ) : null}
      {actionError ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-200">
          {actionError}
        </p>
      ) : null}
      {!portfolio.isLoading && !portfolio.isError ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/50">
            <p aria-live="polite" className="text-sm text-gray-700 dark:text-slate-300">
              {items.length} empresas na competência
              {filtered.length !== items.length ? ` · ${filtered.length} exibidas` : ""}
            </p>
            <div className="flex flex-wrap gap-2" aria-label="Empresas por responsável">
              {counts.map(({ id, name, count }) => (
                <span key={id} className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                  <strong className="font-semibold text-blue-700 dark:text-blue-300">{count}</strong>
                  {name}
                </span>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 text-sm">
            <label className="relative block w-full sm:w-72">
              <span className="sr-only">Buscar empresa ou CNPJ</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
              <input
                type="search"
                aria-label="Buscar empresa ou CNPJ"
                placeholder="Buscar empresa ou CNPJ..."
                value={search}
                onChange={(event) => updateFilter(setSearch, event.target.value)}
                className="h-10 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 text-sm text-gray-900 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </label>
            <select
              aria-label="Documento para filtrar"
              value={documentField}
              onChange={(event) => {
                setDocumentField(event.target.value as TriageFiscalChecklistField);
                setPage(1);
              }}
              className={CONTABIL_SELECT_CLASS}
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
              onChange={(event) => {
                setDocumentStatus(event.target.value as TriagePortfolioDocumentStatus | "");
                setPage(1);
              }}
              className={CONTABIL_SELECT_CLASS}
            >
              <option value="">Todos os status</option>
              <option value="NOT_STARTED">A configurar</option>
              {STATUSES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <select
              aria-label="Filtrar justificativa"
              value={justification}
              onChange={(event) => {
                setJustification(event.target.value as TriagePortfolioJustificationFilter | "");
                setPage(1);
              }}
              className={CONTABIL_SELECT_CLASS}
            >
              <option value="">Com ou sem justificativa</option>
              <option value="with">Com justificativa em algum item</option>
              <option value="without">Sem justificativa</option>
            </select>
          </div>
          <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-slate-700">
              <table className="min-w-full divide-y divide-gray-200 text-left text-sm dark:divide-slate-700">
                <caption className="sr-only">Status dos documentos fiscais por empresa</caption>
                <thead className="bg-gray-50 align-bottom text-xs uppercase tracking-wide text-gray-500 dark:bg-slate-800/70 dark:text-slate-400">
                  <tr>
                    <th scope="col" className="sticky left-0 z-10 w-12 min-w-12 bg-gray-50 px-3 py-3 font-semibold dark:bg-slate-800">Item</th>
                    <th scope="col" className="sticky left-12 z-10 w-56 min-w-56 max-w-56 bg-gray-50 px-3 py-3 font-semibold dark:bg-slate-800">Empresa</th>
                    <th scope="col" className="sticky left-[17rem] z-10 min-w-40 bg-gray-50 px-3 py-3 font-semibold shadow-[inset_-1px_0_0_rgb(229_231_235)] dark:bg-slate-800 dark:shadow-[inset_-1px_0_0_rgb(51_65_85)]">CNPJ</th>
                    <th scope="col" className="min-w-36 px-3 py-3 font-semibold">
                      Regime
                      <select
                        aria-label="Filtrar regime"
                        value={regime}
                        onChange={(event) => updateFilter(setRegime, event.target.value)}
                        className={CONTABIL_TABLE_FILTER_CLASS}
                      >
                        <option value="">Todos</option>
                        {regimes.map((value) => <option key={value} value={value}>{value}</option>)}
                      </select>
                    </th>
                    <th scope="col" className="min-w-44 px-3 py-3 font-semibold">
                      Responsável
                      <select
                        aria-label="Filtrar responsável"
                        value={responsible}
                        onChange={(event) => updateFilter(setResponsible, event.target.value)}
                        className={CONTABIL_TABLE_FILTER_CLASS}
                      >
                        <option value="">Todos</option>
                        {responsibles.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
                      </select>
                    </th>
                    <th scope="col" className="min-w-28 px-3 py-3 font-semibold">
                      Prioridade
                      <select
                        aria-label="Filtrar prioridade"
                        value={priority}
                        onChange={(event) => {
                          setPriority(event.target.value as TriagePortfolioPriorityFilter | "");
                          setPage(1);
                        }}
                        className={CONTABIL_TABLE_FILTER_CLASS}
                      >
                        <option value="">Todas</option>
                        <option value="yes">Sim</option>
                        <option value="no">Não</option>
                      </select>
                    </th>
                    <th scope="col" className="min-w-36 px-3 py-3 font-semibold">
                      Meio de envio
                      <select
                        aria-label="Filtrar meio de envio"
                        value={deliveryMethod}
                        onChange={(event) => updateFilter(setDeliveryMethod, event.target.value)}
                        className={CONTABIL_TABLE_FILTER_CLASS}
                      >
                        <option value="">Todos</option>
                        <option value={TRIAGE_PORTFOLIO_NO_DELIVERY_METHOD}>Não informado</option>
                        {(deliveryMethods.data ?? []).map((item) => (
                          <option key={item.id} value={item.code}>{item.label}</option>
                        ))}
                      </select>
                    </th>
                    {FISCAL_DOCUMENTS.map(([field, label]) => (
                      <th key={field} scope="col" className="min-w-36 px-2 py-3 font-semibold">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white dark:divide-slate-800 dark:bg-slate-900">
                  {visible.length === 0 ? (
                    <tr><td colSpan={7 + FISCAL_DOCUMENTS.length} className="px-4 py-6 text-center text-gray-500 dark:text-slate-400">{items.length === 0 ? "Nenhuma empresa nesta competência." : "Nenhuma empresa corresponde aos filtros."}</td></tr>
                  ) : null}
                  {visible.map((row, index) => (
                    <tr
                      key={row.client_id}
                      className="align-top"
                    >
                      <td className="sticky left-0 z-10 w-12 min-w-12 bg-white px-3 py-3 tabular-nums text-gray-500 dark:bg-slate-900 dark:text-slate-400">{(Math.min(page, totalPages) - 1) * PAGE_SIZE + index + 1}</td>
                      <th
                        scope="row"
                        className="sticky left-12 z-10 w-56 min-w-56 max-w-56 bg-white px-3 py-3 text-left font-medium text-gray-900 dark:bg-slate-900 dark:text-white"
                      >
                        {row.legal_name}
                        {!row.monthly &&
                        row.can_edit &&
                        (row.has_competence || canStartCompetence) ? (
                          <button
                            type="button"
                            disabled={Boolean(saving)}
                            onClick={() => void startMonthly(row)}
                            className="mt-1 block text-xs font-medium text-blue-700 hover:underline disabled:opacity-50 dark:text-blue-300"
                          >
                            Iniciar controle mensal
                          </button>
                        ) : null}
                      </th>
                      <td className="sticky left-[17rem] z-10 min-w-40 whitespace-nowrap bg-white px-3 py-3 tabular-nums text-gray-700 shadow-[inset_-1px_0_0_rgb(229_231_235)] dark:bg-slate-900 dark:text-slate-300 dark:shadow-[inset_-1px_0_0_rgb(51_65_85)]">{formatCpfCnpjInput(row.cpf_cnpj)}</td>
                      <td className="px-3 py-3 text-gray-700 dark:text-slate-300">{row.regime ?? "—"}</td>
                      <td className="px-3 py-3 text-gray-700 dark:text-slate-300">{row.responsible_name ?? "Sem responsável"}</td>
                      <td className="px-3 py-3 text-gray-700 dark:text-slate-300">{row.priority ? "Sim" : "Não"}</td>
                      <td className="px-3 py-3 text-gray-700 dark:text-slate-300">{deliveryLabel(row.delivery_method)}</td>
                      {FISCAL_DOCUMENTS.map(([field, label]) => (
                        <td key={field} className="px-2 py-3 text-gray-700 dark:text-slate-300">
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
                              className="w-full min-w-32 rounded-md border border-gray-300 bg-white px-1 py-1 text-xs dark:border-slate-600 dark:bg-slate-800"
                            >
                              {STATUSES.map(([value, text]) => (
                                <option key={value} value={value}>
                                  {text}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-xs">{statusLabel(fiscalTriagePortfolioItemStatus(row, field))}</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {totalPages > 1 ? (
                <PaginationControls
                  page={Math.min(page, totalPages)}
                  limit={PAGE_SIZE}
                  total={filtered.length}
                  count={visible.length}
                  hasMore={page < totalPages}
                  isFetching={false}
                  totalPages={totalPages}
                  onPrevious={() => setPage((current) => current - 1)}
                  onNext={() => setPage((current) => current + 1)}
                />
              ) : null}
            </div>
        </>
      ) : null}
    </section>
  );
}
