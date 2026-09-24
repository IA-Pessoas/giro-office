import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CalendarDays,
  Check,
  MessageSquareText,
  RotateCcw,
  Search,
  UserCheck,
  X,
} from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import { useAssignableUsers } from "@modules/rh";
import { formatCpfCnpjInput } from "@shared/utils/inputFormatting";

import { useContabilControlPortfolio } from "../hooks";
import { getContabilErrorMessage } from "../services";
import type { ContabilCompetence, ContabilControl } from "../types";
import { CONTABIL_CONTROL_CHECKLIST_FIELDS } from "./contabilControlFields";
import {
  filterContabilPortfolioRows,
  formatContabilCount,
  getContabilCompletionPercent,
  getCurrentContabilCompetence,
} from "./contabilControlSection.helpers";
import { ContabilCompetenceSelect } from "./ContabilCompetenceSelect";
import { ContabilStateBox } from "./ContabilStateBox";

const TEXT_FILTER_COLUMNS = [
  { key: "regime", label: "Regime" },
  { key: "responsible", label: "Responsável" },
  { key: "posted_by", label: "Responsável lançamento" },
] as const;

const FILTER_SELECT_CLASSNAME =
  "mt-1 w-full min-w-[4.5rem] rounded-md border border-gray-300 bg-white px-1 py-1 text-xs font-normal normal-case tracking-normal text-gray-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200";

// Colunas fixas ao rolar: fundo opaco para não vazar o conteúdo que passa por baixo.
const STICKY_ITEM = "sticky left-0 z-10 w-12 min-w-[3rem]";
const STICKY_COMPANY = "sticky left-12 z-10 w-56 min-w-[14rem] max-w-[14rem]";
const STICKY_CNPJ =
  "sticky left-[17rem] z-10 min-w-[10rem] shadow-[inset_-1px_0_0_rgb(229_231_235)] dark:shadow-[inset_-1px_0_0_rgb(51_65_85)]";
const HEAD_BG = "bg-gray-50 dark:bg-slate-800";
const BODY_BG = "bg-white dark:bg-slate-900";

type ProgressSort = "none" | "asc" | "desc";

function completedItems(control: ContabilControl): number {
  return CONTABIL_CONTROL_CHECKLIST_FIELDS.filter((field) => control[field.field]).length;
}

function uniqueSorted(values: string[]) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right, "pt-BR"));
}

export function ContabilPortfolioSection() {
  const [competence, setCompetence] = useState<ContabilCompetence>(getCurrentContabilCompetence());
  const portfolioQuery = useContabilControlPortfolio(competence);
  const items = portfolioQuery.data?.items ?? [];
  const controlsStarted = items.filter((item) => item.control !== null).length;
  const missingControls = items.length - controlsStarted;
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [onlyMine, setOnlyMine] = useState(false);
  const [progressSort, setProgressSort] = useState<ProgressSort>("none");
  const { user } = useAuth();
  const assignableUsersQuery = useAssignableUsers({ enabled: items.length > 0, module: "contabil" });

  const rows = useMemo(() => {
    const userNames = new Map(
      (assignableUsersQuery.data ?? []).map((user) => [user.id, user.name.trim()]),
    );
    const userName = (id: string | null) => (id ? userNames.get(id) ?? "Não encontrado" : "—");

    return items.map((item) => {
      const cnpj = item.cpf_cnpj ? formatCpfCnpjInput(item.cpf_cnpj) : "—";
      const values: Record<string, string> = {
        regime: item.regime || "—",
        responsible: userName(item.person_responsible_id),
        posted_by: userName(item.posted_by_id),
      };
      for (const field of CONTABIL_CONTROL_CHECKLIST_FIELDS) {
        values[field.field] = item.control?.[field.field] ? "done" : "pending";
      }
      return {
        item,
        cnpj,
        values,
        progress: item.control ? completedItems(item.control) : -1,
        notes: item.control?.notes?.trim() || null,
        searchText: `${item.legal_name} ${cnpj} ${item.cpf_cnpj}`,
      };
    });
  }, [items, assignableUsersQuery.data]);

  const filterOptions = useMemo(
    () =>
      Object.fromEntries(
        TEXT_FILTER_COLUMNS.map((column) => [
          column.key,
          uniqueSorted(rows.map((row) => row.values[column.key])),
        ]),
      ),
    [rows],
  );
  const visibleRows = filterContabilPortfolioRows(
    onlyMine && user
      ? rows.filter(
          ({ item }) => item.person_responsible_id === user.id || item.posted_by_id === user.id,
        )
      : rows,
    search,
    filters,
  );
  if (progressSort !== "none") {
    visibleRows.sort((left, right) =>
      progressSort === "asc" ? left.progress - right.progress : right.progress - left.progress,
    );
  }
  const totalChecks = CONTABIL_CONTROL_CHECKLIST_FIELDS.length;
  const SortIcon = { none: ArrowUpDown, asc: ArrowUp, desc: ArrowDown }[progressSort];
  const setFilter = (key: string, value: string) =>
    setFilters((current) => ({ ...current, [key]: value }));

  return (
    <section className="space-y-4" aria-labelledby="contabil-portfolio-title">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 id="contabil-portfolio-title" className="text-lg font-semibold text-gray-900 dark:text-white">
            Carteira operacional
          </h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">
            Acompanhe todos os clientes Contábil da competência sem abrir cada ficha.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-slate-300">
          <CalendarDays aria-hidden="true" className="h-4 w-4 text-blue-600 dark:text-blue-300" />
          Competência
          <ContabilCompetenceSelect
            label="Competência da carteira"
            value={competence}
            onChange={setCompetence}
          />
        </label>
      </div>

      {portfolioQuery.isLoading ? (
        <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-slate-700">
          <div className="h-11 animate-pulse bg-gray-100 dark:bg-slate-800" />
          <div className="space-y-3 p-4">
            <div className="h-5 animate-pulse rounded bg-gray-100 dark:bg-slate-800" />
            <div className="h-5 animate-pulse rounded bg-gray-100 dark:bg-slate-800" />
            <div className="h-5 animate-pulse rounded bg-gray-100 dark:bg-slate-800" />
          </div>
        </div>
      ) : null}

      {portfolioQuery.isError ? (
        <ContabilStateBox icon={AlertCircle} tone="danger" title="Não foi possível carregar a carteira">
          <span>{getContabilErrorMessage(portfolioQuery.error)}</span>
          <button
            type="button"
            onClick={() => void portfolioQuery.refetch()}
            className="mt-3 inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold transition-colors hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-500/30 dark:border-red-900/50 dark:hover:bg-red-900/30"
          >
            <RotateCcw aria-hidden="true" className="h-4 w-4" />
            Tentar novamente
          </button>
        </ContabilStateBox>
      ) : null}

      {!portfolioQuery.isLoading && !portfolioQuery.isError && items.length === 0 ? (
        <ContabilStateBox icon={CalendarDays} title="Nenhum cliente elegível nesta competência">
          Não há clientes Contábil elegíveis no intervalo desta competência.
        </ContabilStateBox>
      ) : null}

      {!portfolioQuery.isLoading && !portfolioQuery.isError && items.length > 0 ? (
        <>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p aria-live="polite" className="text-sm text-gray-600 dark:text-slate-400">
              {formatContabilCount(items.length, "cliente", "clientes")},{" "}
              {formatContabilCount(controlsStarted, "controle iniciado", "controles iniciados")} e{" "}
              {missingControls} sem controle mensal.
              {visibleRows.length !== items.length ? ` Exibindo ${visibleRows.length}.` : null}
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              type="button"
              aria-pressed={onlyMine}
              onClick={() => setOnlyMine((current) => !current)}
              className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/30 ${
                onlyMine
                  ? "border-blue-600 bg-blue-600 text-white hover:bg-blue-700"
                  : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              }`}
            >
              <UserCheck aria-hidden="true" className="h-4 w-4" />
              Meus clientes
            </button>
            <label className="relative block sm:w-80">
              <span className="sr-only">Buscar empresa ou CNPJ</span>
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar empresa ou CNPJ..."
                className="h-10 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 text-sm text-gray-900 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </label>
            </div>
          </div>
          <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-slate-700">
            <table className="min-w-full divide-y divide-gray-200 text-left text-sm dark:divide-slate-700">
              <thead className="bg-gray-50 align-bottom text-xs uppercase tracking-wide text-gray-500 dark:bg-slate-800/70 dark:text-slate-400">
                <tr>
                  <th scope="col" className={`${STICKY_ITEM} ${HEAD_BG} px-3 py-3 font-semibold`}>Item</th>
                  <th scope="col" className={`${STICKY_COMPANY} ${HEAD_BG} px-3 py-3 font-semibold`}>Empresa</th>
                  <th scope="col" className={`${STICKY_CNPJ} ${HEAD_BG} px-3 py-3 font-semibold`}>CNPJ</th>
                  {TEXT_FILTER_COLUMNS.map((column) => (
                    <th key={column.key} scope="col" className="min-w-[8rem] px-3 py-3 font-semibold">
                      {column.label}
                      <select
                        aria-label={`Filtrar ${column.label}`}
                        value={filters[column.key] ?? ""}
                        onChange={(event) => setFilter(column.key, event.target.value)}
                        className={FILTER_SELECT_CLASSNAME}
                      >
                        <option value="">Todos</option>
                        {filterOptions[column.key].map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    </th>
                  ))}
                  <th scope="col" className="px-3 py-3 font-semibold">Fechamento recebido</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Controle mensal</th>
                  {CONTABIL_CONTROL_CHECKLIST_FIELDS.map((field) => (
                    <th key={field.field} scope="col" className="min-w-[6.5rem] px-2 py-3 font-semibold">
                      {field.label}
                      <select
                        aria-label={`Filtrar ${field.label}`}
                        value={filters[field.field] ?? ""}
                        onChange={(event) => setFilter(field.field, event.target.value)}
                        className={FILTER_SELECT_CLASSNAME}
                      >
                        <option value="">Todos</option>
                        <option value="done">Feito</option>
                        <option value="pending">Pendente</option>
                      </select>
                    </th>
                  ))}
                  <th
                    scope="col"
                    aria-sort={progressSort === "none" ? "none" : progressSort === "asc" ? "ascending" : "descending"}
                    className="min-w-[8rem] px-3 py-3 font-semibold"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setProgressSort((current) =>
                          current === "asc" ? "desc" : current === "desc" ? "none" : "asc",
                        )
                      }
                      className="inline-flex items-center gap-1 whitespace-nowrap uppercase tracking-wide hover:text-gray-900 dark:hover:text-white"
                    >
                      Itens concluídos
                      <SortIcon aria-hidden="true" className="h-3.5 w-3.5" />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white dark:divide-slate-800 dark:bg-slate-900">
                {visibleRows.length === 0 ? (
                  <tr>
                    <td colSpan={9 + CONTABIL_CONTROL_CHECKLIST_FIELDS.length} className="px-4 py-6 text-center text-gray-500 dark:text-slate-400">
                      Nenhum cliente corresponde aos filtros.
                    </td>
                  </tr>
                ) : null}
                {visibleRows.map(({ item, cnpj, values, progress, notes }, index) => {
                  return (
                    <tr key={item.client_id} className="align-top">
                      <td className={`${STICKY_ITEM} ${BODY_BG} px-3 py-3 tabular-nums text-gray-500 dark:text-slate-400`}>{index + 1}</td>
                      <td className={`${STICKY_COMPANY} ${BODY_BG} px-3 py-3 font-medium`}>
                        <Link
                          href={`/clients/${item.client_id}/contabil`}
                          className="text-blue-700 hover:underline dark:text-blue-300"
                        >
                          {item.legal_name}
                        </Link>
                        {notes ? (
                          <span title={notes} className="ml-1.5 inline-flex align-middle text-amber-600 dark:text-amber-400">
                            <MessageSquareText aria-hidden="true" className="h-4 w-4" />
                            <span className="sr-only">Observação: {notes}</span>
                          </span>
                        ) : null}
                      </td>
                      <td className={`${STICKY_CNPJ} ${BODY_BG} whitespace-nowrap px-3 py-3 tabular-nums text-gray-700 dark:text-slate-300`}>{cnpj}</td>
                      {TEXT_FILTER_COLUMNS.map((column) => (
                        <td key={column.key} className="px-3 py-3 text-gray-700 dark:text-slate-300">{values[column.key]}</td>
                      ))}
                      <td className="px-3 py-3 text-gray-700 dark:text-slate-300">
                        {{
                          NOT_RECEIVED: "Não recebido",
                          RECEIVED: "Recebido",
                          UNDER_REVIEW: "Em conferência",
                          CLOSED: "Fechado",
                          REOPENED: "Reaberto",
                        }[item.closing.status]}
                      </td>
                      <td className="px-3 py-3 text-gray-700 dark:text-slate-300">
                        {item.control ? "Iniciado" : "—"}
                      </td>
                      {CONTABIL_CONTROL_CHECKLIST_FIELDS.map((field) => (
                        <td key={field.field} className="px-2 py-3">
                          {!item.control ? (
                            <span className="text-gray-400">—</span>
                          ) : item.control[field.field] ? (
                            <Check aria-label="Feito" className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                          ) : (
                            <X aria-label="Pendente" className="h-4 w-4 text-rose-500 dark:text-rose-400" />
                          )}
                        </td>
                      ))}
                      <td className="px-3 py-3 tabular-nums text-gray-700 dark:text-slate-300">
                        {progress < 0 ? (
                          "—"
                        ) : (
                          <div className="flex items-center gap-2">
                            <span>{`${progress}/${totalChecks} · ${getContabilCompletionPercent(progress, totalChecks)}%`}</span>
                            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-gray-200 dark:bg-slate-700" aria-hidden="true">
                              <div
                                className={`h-full rounded-full ${progress === totalChecks ? "bg-emerald-500" : "bg-blue-500"}`}
                                style={{ width: `${(progress / totalChecks) * 100}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {visibleRows.length > 0 ? (
                <tfoot className="border-t-2 border-gray-200 bg-gray-50 text-xs font-semibold text-gray-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  <tr>
                    <td className={`${STICKY_ITEM} ${HEAD_BG} px-3 py-3`} />
                    <th scope="row" className={`${STICKY_COMPANY} ${HEAD_BG} px-3 py-3 text-left`}>
                      Concluídos
                    </th>
                    <td className={`${STICKY_CNPJ} ${HEAD_BG} px-3 py-3`} />
                    <td colSpan={TEXT_FILTER_COLUMNS.length + 2} />
                    {CONTABIL_CONTROL_CHECKLIST_FIELDS.map((field) => (
                      <td key={field.field} className="px-2 py-3 tabular-nums">
                        {visibleRows.filter(({ item }) => item.control?.[field.field]).length}/{visibleRows.length}
                      </td>
                    ))}
                    <td />
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
        </>
      ) : null}
    </section>
  );
}
