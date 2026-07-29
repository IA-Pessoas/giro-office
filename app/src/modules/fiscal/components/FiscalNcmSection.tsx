import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Loader2,
  Pencil,
  Plus,
  Search,
  ScrollText,
  Trash2,
} from "lucide-react";
import { toast } from "react-toastify";

import { Dialog } from "@shared/components";
import { PaginationControls } from "@shared/components/ui/PaginationControls";

import { useDeleteFiscalNcmMutation, useFiscalNcmList } from "../hooks";
import { FISCAL_LIST_PAGE_SIZE } from "../hooks/queryKeys";
import type { FiscalNcm } from "../types";
import {
  formatFiscalDateLabel,
  getFiscalErrorMessage,
  parseCommaSeparatedCodes,
} from "../utils";
import { FiscalNcmFormPanel } from "./FiscalNcmFormPanel";
import { FiscalStateBox } from "./FiscalStateBox";

type FiscalNcmPanelIntent =
  | { mode: "create" }
  | { mode: "edit"; ncmId: string }
  | null;

const ACTION_BUTTON_CLASSNAME =
  "inline-flex h-8 w-8 items-center justify-center rounded-md border text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60";

const DIALOG_SECONDARY_BUTTON_CLASSNAME =
  "inline-flex h-9 items-center justify-center rounded-md border border-gray-300 px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800";

const DIALOG_DANGER_BUTTON_CLASSNAME =
  "inline-flex h-9 items-center justify-center gap-2 rounded-md bg-red-600 px-3 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60";

const TABLE_HEADER_CLASSNAME =
  "px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-700 dark:text-slate-300";

const TABLE_TEXT_CELL_CLASSNAME =
  "px-3 py-2.5 text-sm leading-5 break-words text-gray-700 dark:text-slate-300";

const TABLE_CENTER_CELL_CLASSNAME =
  "px-3 py-2.5 text-center text-sm leading-5 text-gray-700 dark:text-slate-300";

const TABLE_CODE_CELL_CLASSNAME =
  "px-4 py-2.5 text-center text-sm font-medium leading-5 text-gray-900 dark:text-white";

export function FiscalNcmSection({
  canEdit,
  canDelete,
}: {
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [filterValue, setFilterValue] = useState("");
  const [searchCodes, setSearchCodes] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [panelIntent, setPanelIntent] = useState<FiscalNcmPanelIntent>(null);
  const [deleteTarget, setDeleteTarget] = useState<FiscalNcm | null>(null);
  const deleteMutation = useDeleteFiscalNcmMutation();

  const searchQuery = useFiscalNcmList({
    ncmCodes: searchCodes,
    page,
    page_size: FISCAL_LIST_PAGE_SIZE,
  });
  const errorMessage = searchQuery.error
    ? getFiscalErrorMessage(searchQuery.error)
    : null;

  const searchLabel = useMemo(() => searchCodes.join(", "), [searchCodes]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setSearchCodes(parseCommaSeparatedCodes(filterValue));
      setPage(1);
    }, 350);

    return () => window.clearTimeout(timeoutId);
  }, [filterValue]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearchCodes(parseCommaSeparatedCodes(filterValue));
    setPage(1);
  }

  function handleDeleteDialogOpenChange(open: boolean) {
    if (!open && !deleteMutation.isPending) {
      setDeleteTarget(null);
    }
  }

  async function handleConfirmDelete() {
    if (!canDelete || !deleteTarget) {
      return;
    }

    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
      toast.success("NCM excluído com sucesso.");
    } catch (error) {
      toast.error(getFiscalErrorMessage(error));
    }
  }

  if (panelIntent && canEdit) {
    return (
      <section className="space-y-4">
        <div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setPanelIntent(null)}
                className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-gray-300 px-3 text-[13px] font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Listagem
              </button>
              <div className="inline-flex h-8 items-center justify-center rounded-md bg-blue-50 px-3 text-[13px] font-semibold text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
                {panelIntent.mode === "edit" ? "Edição" : "Novo cadastro"}
              </div>
            </div>

            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {panelIntent.mode === "edit" ? "Editar NCM" : "Novo NCM"}
                </h2>
                <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">
                  {panelIntent.mode === "edit"
                    ? "Revise os campos do cadastro selecionado e salve quando terminar."
                    : "Preencha os dados fiscais para criar um novo cadastro de NCM."}
                </p>
              </div>

              {searchCodes.length > 0 ? (
                <div className="text-sm text-gray-500 dark:text-slate-400">
                  Busca atual:{" "}
                  <span className="font-medium text-gray-900 dark:text-white">
                    {searchLabel}
                  </span>
                </div>
              ) : null}
            </div>
          </div>
          <div className="mt-4">
            <FiscalNcmFormPanel
              mode={panelIntent.mode}
              ncmId={panelIntent.mode === "edit" ? panelIntent.ncmId : undefined}
              onClose={() => setPanelIntent(null)}
              showHeader={false}
              bare
            />
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-col gap-2.5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-1.5">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-300">
                <ScrollText className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">NCM</h2>
                <p className="text-sm text-gray-600 dark:text-slate-400">
                  Consulte códigos específicos e prepare novos cadastros no mesmo fluxo.
                </p>
              </div>
            </div>
          </div>

          {canEdit ? (
            <button
              type="button"
              onClick={() => setPanelIntent({ mode: "create" })}
              className="inline-flex h-10 items-center justify-center gap-2 self-start rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            >
              <Plus className="h-4 w-4" />
              Novo NCM
            </button>
          ) : null}
        </div>

        <form className="mt-3 space-y-2.5" onSubmit={handleSubmit}>
          <div className="space-y-1.5">
            <span className="block text-sm font-medium text-gray-700 dark:text-slate-300">
              Códigos NCM
            </span>
            <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400 dark:text-slate-500" />
                <input
                  type="text"
                  value={filterValue}
                  onChange={(event) => setFilterValue(event.target.value)}
                  placeholder="Ex.: 84719012, 84715010"
                  className="h-9 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 text-[13px] text-gray-900 outline-none transition-all placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-500"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  className="inline-flex h-9 min-w-[88px] items-center justify-center rounded-lg bg-blue-600 px-3.5 text-[13px] font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                >
                  Buscar
                </button>
                {filterValue ? (
                  <button
                    type="button"
                    onClick={() => {
                      setFilterValue("");
                      setSearchCodes([]);
                      setPage(1);
                    }}
                    className="inline-flex h-9 min-w-[72px] items-center justify-center rounded-lg border border-gray-300 px-3.5 text-[13px] font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                  >
                    Limpar
                  </button>
                ) : null}
              </div>
            </div>
            <p className="text-xs text-gray-500 dark:text-slate-400">
              Digite parte do codigo ou use virgulas para consultar mais de um NCM.
            </p>
          </div>
        </form>
      </div>

      {searchQuery.isLoading && !searchQuery.data ? (
        <FiscalStateBox icon={Loader2} tone="loading" title="Buscando NCMs" compact>
          Estamos consultando os registros fiscais.
        </FiscalStateBox>
      ) : null}

      {searchQuery.error && !searchQuery.data ? (
        <FiscalStateBox icon={AlertCircle} tone="danger" title="Não foi possível carregar a lista de NCM" compact>
          {errorMessage}
        </FiscalStateBox>
      ) : null}

      {searchQuery.data ? (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {searchQuery.data.data.length === 1
                  ? "1 registro encontrado"
                  : `${searchQuery.data.total} registros encontrados`}
              </p>
              <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">
                Busca atual: {searchCodes.length > 0 ? searchLabel : "Listagem geral"}
              </p>
            </div>

            {searchQuery.isFetching ? (
              <div className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700 dark:border-blue-900/40 dark:bg-blue-950/20 dark:text-blue-300">
                <Loader2 className="h-4 w-4 animate-spin" />
                Atualizando resultados
              </div>
            ) : null}
          </div>

          {searchQuery.error ? (
            <FiscalStateBox icon={AlertCircle} tone="danger" title="Não foi possível atualizar a listagem" compact>
              {errorMessage}
            </FiscalStateBox>
          ) : null}

          {searchQuery.data.data.length > 0 ? (
            <FiscalNcmTable
              items={searchQuery.data.data}
              onEdit={canEdit ? (item) => setPanelIntent({ mode: "edit", ncmId: item.id }) : undefined}
              onDelete={canDelete ? (item) => setDeleteTarget(item) : undefined}
              isDeleting={deleteMutation.isPending}
            />
          ) : (
            <FiscalStateBox icon={ScrollText} title="Nenhum NCM encontrado" compact>
              Não localizamos registros para os códigos informados. Revise a busca e tente novamente.
            </FiscalStateBox>
          )}

          <PaginationControls
            page={searchQuery.data.page}
            limit={searchQuery.data.limit}
            total={searchQuery.data.total}
            count={searchQuery.data.data.length}
            hasMore={searchQuery.data.hasMore}
            isFetching={searchQuery.isFetching}
            onPrevious={() => setPage((currentPage) => Math.max(1, currentPage - 1))}
            onNext={() => setPage((currentPage) => currentPage + 1)}
          />
        </div>
      ) : null}

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={handleDeleteDialogOpenChange}
        title="Excluir NCM"
        description="Confirmação de exclusão de NCM"
        contentClassName="w-[min(92vw,520px)]"
        bodyClassName="space-y-3"
        footer={
          <>
            <button
              type="button"
              onClick={() => setDeleteTarget(null)}
              disabled={deleteMutation.isPending}
              className={DIALOG_SECONDARY_BUTTON_CLASSNAME}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirmDelete}
              disabled={deleteMutation.isPending}
              className={DIALOG_DANGER_BUTTON_CLASSNAME}
            >
              {deleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Confirmar exclusão
            </button>
          </>
        }
      >
        <p className="text-sm text-gray-700 dark:text-slate-300">
          Esta ação remove o cadastro fiscal selecionado.
        </p>
        {deleteTarget ? (
          <p className="rounded-lg bg-gray-50 px-3 py-2 text-sm font-medium text-gray-800 dark:bg-gray-900/30 dark:text-gray-200">
            {deleteTarget.ncm_code} · {deleteTarget.description}
          </p>
        ) : null}
      </Dialog>
    </section>
  );
}

function FiscalNcmTable({
  items,
  onEdit,
  onDelete,
  isDeleting = false,
}: {
  items: FiscalNcm[];
  onEdit?: (item: FiscalNcm) => void;
  onDelete?: (item: FiscalNcm) => void;
  isDeleting?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      <table className="w-full table-fixed divide-y divide-gray-200 dark:divide-slate-700">
        <thead className="bg-gray-50 dark:bg-slate-800/60">
          <tr>
            <th className={`${TABLE_HEADER_CLASSNAME} w-[12%] px-4`}>
              NCM
            </th>
            <th className={`${TABLE_HEADER_CLASSNAME} w-[26%]`}>
              Descrição
            </th>
            <th className={`${TABLE_HEADER_CLASSNAME} w-[18%]`}>
              Regime
            </th>
            <th className={`${TABLE_HEADER_CLASSNAME} w-[16%]`}>
              Tributação
            </th>
            <th className={`${TABLE_HEADER_CLASSNAME} w-[11%]`}>
              Início
            </th>
            <th className={`${TABLE_HEADER_CLASSNAME} w-[10%]`}>
              Fim
            </th>
            {onEdit || onDelete ? (
              <th className={`${TABLE_HEADER_CLASSNAME} w-[7%] px-3`}>
                Ação
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
          {items.map((item) => (
            <tr key={item.id} className="align-middle hover:bg-gray-50 dark:hover:bg-slate-800/30">
              <td className={TABLE_CODE_CELL_CLASSNAME}>
                {item.ncm_code}
              </td>
              <td className={TABLE_TEXT_CELL_CLASSNAME}>
                {item.description}
              </td>
              <td className={TABLE_TEXT_CELL_CLASSNAME}>
                {item.tax_regime}
              </td>
              <td className={TABLE_TEXT_CELL_CLASSNAME}>
                {item.federal_taxation_type}
              </td>
              <td className={TABLE_CENTER_CELL_CLASSNAME}>
                {formatFiscalDateLabel(item.validity_start_date)}
              </td>
              <td className={TABLE_CENTER_CELL_CLASSNAME}>
                {item.validity_end_date ? formatFiscalDateLabel(item.validity_end_date) : "Sem fim"}
              </td>
              {onEdit || onDelete ? (
                <td className="px-3 py-2.5 text-center">
                  <div className="flex justify-center gap-1">
                    {onEdit ? (
                      <button
                        type="button"
                        onClick={() => onEdit(item)}
                        disabled={isDeleting}
                        aria-label={`Editar NCM ${item.ncm_code}`}
                        title="Editar"
                        className={`${ACTION_BUTTON_CLASSNAME} border-blue-200 text-blue-700 hover:bg-blue-50 dark:border-blue-900/40 dark:text-blue-300 dark:hover:bg-blue-900/20`}
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    ) : null}
                    {onDelete ? (
                      <button
                        type="button"
                        onClick={() => onDelete(item)}
                        disabled={isDeleting}
                        aria-label={`Excluir NCM ${item.ncm_code}`}
                        title="Excluir"
                        className={`${ACTION_BUTTON_CLASSNAME} border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900/40 dark:text-red-300 dark:hover:bg-red-900/20`}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    ) : null}
                  </div>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
