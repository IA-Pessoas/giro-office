import { PaginationControls } from "@shared/components";
import { StatusBadge, type StatusBadgeVariant } from "@shared/components/StatusBadge";
import { useDebouncedValue } from "@shared/hooks";
import { formatDateTime } from "@shared/utils/dateFormat";
import { formatDateToInput } from "@shared/utils/formatters";
import { useState } from "react";

import {
  useRegularizeDteNotices,
  useSetRegularizeDteNoticeReadingMutation,
} from "../hooks/useRegularizeOperations";
import { REGULARIZE_DTE_NO_TIPO_FILTER } from "../services/regularizeService.contract";
import {
  REGULARIZE_DTE_NOTICE_READING_FILTERS,
  type RegularizeDteNotice,
  type RegularizeDteNoticeListFilters,
  type RegularizeDteNoticeReadingFilter,
} from "../types";
import { getRegularizeMutationErrorMessage } from "../utils/regularizeForm";
import { RegularizeNativeSelect } from "./RegularizeNativeSelect";
import {
  regularizePanelClassName,
  regularizePanelLabelClassName,
  regularizeSecondaryButtonClassName,
  regularizeTextFieldClassName,
} from "./regularizeFormControls";

const PAGE_SIZE = 20;
// Mesmo valor de DTE_NOTICE_DEFAULT_WINDOW_DAYS no serviço; aqui ele vira a data do filtro.
const DEFAULT_WINDOW_DAYS = 45;
const DAY_MS = 24 * 60 * 60 * 1000;

// O tipo do aviso é a classe do selo que o portal exibia (Bootstrap 2). Sem amostra real,
// não se sabe quais cores o portal usa de fato: valor fora da lista aparece como veio.
const TIPO_OPTIONS: Array<{ value: string; label: string; variant: StatusBadgeVariant }> = [
  { value: "badge-important", label: "Vermelho", variant: "danger" },
  { value: "badge-warning", label: "Amarelo", variant: "warning" },
  { value: "badge-success", label: "Verde", variant: "success" },
  { value: "badge-info", label: "Azul", variant: "info" },
  { value: "badge-inverse", label: "Preto", variant: "neutral" },
];

const cellClassName = "px-3 py-2 align-top";

function initialFilters(): RegularizeDteNoticeListFilters {
  return {
    from: formatDateToInput(new Date(Date.now() - DEFAULT_WINDOW_DAYS * DAY_MS)),
    to: "",
    tipo: "",
    search: "",
    reading: "Todos",
    page: 1,
    limit: PAGE_SIZE,
  };
}

function TipoBadge({ tipo }: { tipo: string }) {
  const option = TIPO_OPTIONS.find((item) => tipo.includes(item.value));

  return (
    <StatusBadge
      size="sm"
      config={{ label: option?.label ?? (tipo || "Sem cor"), variant: option?.variant ?? "neutral" }}
    />
  );
}

// Caixa de avisos DTE (#1745): avisos importados pela colagem (#1744). O período filtra pela
// data da importação, porque as datas do próprio aviso ficam como texto da origem.
export function RegularizeDteInbox({ canEdit }: { canEdit: boolean }) {
  const [filters, setFilters] = useState(initialFilters);
  const debouncedSearch = useDebouncedValue(filters.search, 300);
  const noticesQuery = useRegularizeDteNotices({ ...filters, search: debouncedSearch });
  const readingMutation = useSetRegularizeDteNoticeReadingMutation();
  const notices: RegularizeDteNotice[] = noticesQuery.data?.data ?? [];

  function changeFilter(change: Partial<RegularizeDteNoticeListFilters>) {
    setFilters((current) => ({ ...current, ...change, page: 1 }));
  }

  return (
    <section className={regularizePanelClassName}>
      <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Caixa de avisos DTE</h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        Avisos importados pela colagem, a partir dos últimos {DEFAULT_WINDOW_DAYS} dias. O período
        considera a data da importação.
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className={regularizePanelLabelClassName}>
          Importado de
          <input
            type="date"
            className={`${regularizeTextFieldClassName} mt-1.5`}
            value={filters.from}
            onChange={(event) => changeFilter({ from: event.target.value })}
          />
        </label>
        <label className={regularizePanelLabelClassName}>
          Até
          <input
            type="date"
            className={`${regularizeTextFieldClassName} mt-1.5`}
            value={filters.to}
            onChange={(event) => changeFilter({ to: event.target.value })}
          />
        </label>
        <label className={regularizePanelLabelClassName}>
          Cor
          <RegularizeNativeSelect
            className="mt-1.5"
            value={filters.tipo}
            onChange={(event) => changeFilter({ tipo: event.target.value })}
          >
            <option value="">Todas</option>
            {TIPO_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
            <option value={REGULARIZE_DTE_NO_TIPO_FILTER}>Sem cor</option>
          </RegularizeNativeSelect>
        </label>
        <label className={regularizePanelLabelClassName}>
          Leitura
          <RegularizeNativeSelect
            className="mt-1.5"
            value={filters.reading}
            onChange={(event) =>
              changeFilter({ reading: event.target.value as RegularizeDteNoticeReadingFilter })
            }
          >
            {REGULARIZE_DTE_NOTICE_READING_FILTERS.map((option) => (
              <option key={option} value={option}>
                {option === "Todos" ? "Todas" : option}
              </option>
            ))}
          </RegularizeNativeSelect>
        </label>
        <label className={regularizePanelLabelClassName}>
          Aviso
          <input
            type="search"
            className={`${regularizeTextFieldClassName} mt-1.5`}
            value={filters.search}
            onChange={(event) => changeFilter({ search: event.target.value })}
            maxLength={200}
            placeholder="Texto do aviso"
          />
        </label>
      </div>

      {readingMutation.isError ? (
        <p
          role="alert"
          className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:bg-rose-950/40 dark:text-rose-200"
        >
          {getRegularizeMutationErrorMessage(
            readingMutation.error,
            "Não foi possível alterar a leitura do aviso. Tente novamente.",
          )}
        </p>
      ) : null}

      {noticesQuery.isLoading ? (
        <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">Carregando avisos…</p>
      ) : noticesQuery.isError ? (
        <p role="alert" className="mt-4 text-sm text-rose-700 dark:text-rose-300">
          Não foi possível carregar os avisos. Tente novamente.
        </p>
      ) : !notices.length ? (
        <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">
          {filters.page > 1
            ? "Não há mais avisos nesta página."
            : "Nenhum aviso encontrado com esses filtros."}
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm dark:divide-slate-700">
            <thead className="text-xs uppercase text-slate-500 dark:text-slate-400">
              <tr>
                <th className={cellClassName}>Cor</th>
                <th className={cellClassName}>Aviso</th>
                <th className={cellClassName}>CNPJ/CPF</th>
                <th className={cellClassName}>Destinatário</th>
                <th className={cellClassName}>Assunto</th>
                <th className={cellClassName}>Emissão</th>
                <th className={cellClassName}>Importado em</th>
                <th className={cellClassName}>Leitura</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-slate-800 dark:divide-slate-700 dark:text-slate-100">
              {notices.map((notice) => (
                <tr key={notice.id}>
                  <td className={cellClassName}>
                    <TipoBadge tipo={notice.tipo} />
                  </td>
                  <td className={cellClassName}>{notice.aviso}</td>
                  <td className={`${cellClassName} whitespace-nowrap`}>{notice.cnpj_cpf}</td>
                  <td className={cellClassName}>{notice.destinatario}</td>
                  <td className={cellClassName}>{notice.assunto}</td>
                  <td className={`${cellClassName} whitespace-nowrap`}>
                    {notice.data_emissao ?? "—"}
                  </td>
                  <td className={`${cellClassName} whitespace-nowrap`}>
                    {formatDateTime(notice.created_at)}
                  </td>
                  <td className={`${cellClassName} whitespace-nowrap`}>
                    <span className="mr-2">{notice.pending_reading ? "Pendente" : "Lido"}</span>
                    {canEdit ? (
                      <button
                        type="button"
                        className={`${regularizeSecondaryButtonClassName} px-2 py-1 text-xs`}
                        disabled={readingMutation.isPending}
                        onClick={() =>
                          readingMutation.mutate({
                            id: notice.id,
                            pending_reading: !notice.pending_reading,
                          })
                        }
                      >
                        {notice.pending_reading ? "Marcar como lido" : "Marcar como pendente"}
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Fora do ramo com itens: marcar como lido o último aviso de uma página a deixa vazia. */}
      {notices.length || filters.page > 1 ? (
        <PaginationControls
          page={filters.page}
          limit={filters.limit}
          total={noticesQuery.data?.total ?? 0}
          count={notices.length}
          hasMore={noticesQuery.data?.hasMore ?? false}
          isFetching={noticesQuery.isFetching}
          onPrevious={() =>
            setFilters((current) => ({ ...current, page: Math.max(1, current.page - 1) }))
          }
          onNext={() => setFilters((current) => ({ ...current, page: current.page + 1 }))}
        />
      ) : null}
    </section>
  );
}
