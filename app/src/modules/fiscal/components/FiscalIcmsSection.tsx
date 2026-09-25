import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Landmark,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "@shared/services/toast";

import { ConfirmationDialog } from "@shared/components";
import { PaginationControls } from "@shared/components/ui/PaginationControls";

import { useDeleteFiscalIcmsMutation, useFiscalIcmsList } from "../hooks";
import { FISCAL_LIST_PAGE_SIZE } from "../hooks/queryKeys";
import type { FiscalIcms } from "../types";
import {
  getFiscalErrorMessage,
  parseCommaSeparatedValues,
} from "../utils";
import { FiscalIcmsFormPanel } from "./FiscalIcmsFormPanel";
import { FiscalStateBox } from "./FiscalStateBox";

type FiscalIcmsPanelIntent =
  | { mode: "create" }
  | { mode: "edit"; icmsId: string }
  | null;

const ACTION_BUTTON_CLASSNAME =
  "inline-flex h-8 w-8 items-center justify-center rounded-md border text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60";

const TABLE_HEADER_CLASSNAME =
  "px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-700 dark:text-slate-300";

const TABLE_TEXT_CELL_CLASSNAME =
  "px-3 py-2.5 text-sm leading-5 break-words text-gray-700 dark:text-slate-300";

const TABLE_CENTER_CELL_CLASSNAME =
  "px-3 py-2.5 text-center text-sm leading-5 text-gray-700 dark:text-slate-300";

const TABLE_CODE_CELL_CLASSNAME =
  "px-4 py-2.5 text-center text-sm font-medium leading-5 text-gray-900 dark:text-white";

export function FiscalIcmsSection({
  canEdit,
  canDelete,
}: {
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [filterValue, setFilterValue] = useState("");
  const [searchTerms, setSearchTerms] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [panelIntent, setPanelIntent] = useState<FiscalIcmsPanelIntent>(null);
  const [deleteTarget, setDeleteTarget] = useState<FiscalIcms | null>(null);
  const deleteMutation = useDeleteFiscalIcmsMutation();

  const listQuery = useFiscalIcmsList({
    icmsCodes: searchTerms,
    page,
    page_size: FISCAL_LIST_PAGE_SIZE,
  });
  const errorMessage = listQuery.error ? getFiscalErrorMessage(listQuery.error) : null;
  const searchLabel = useMemo(() => searchTerms.join(", "), [searchTerms]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setSearchTerms(parseCommaSeparatedValues(filterValue));
      setPage(1);
    }, 350);

    return () => window.clearTimeout(timeoutId);
  }, [filterValue]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearchTerms(parseCommaSeparatedValues(filterValue));
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
      toast.success("ICMS excluído com sucesso.");
    } catch (error) {
      toast.error(getFiscalErrorMessage(error));
      // Relança para o ConfirmationDialog permanecer aberto.
      throw error;
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
                  {panelIntent.mode === "edit" ? "Editar ICMS" : "Novo ICMS"}
                </h2>
                <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">
                  {panelIntent.mode === "edit"
                    ? "Revise os campos do cadastro selecionado e salve quando terminar."
                    : "Preencha os dados fiscais para criar um novo cadastro de ICMS."}
                </p>
              </div>

              {searchTerms.length > 0 ? (
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
            <FiscalIcmsFormPanel
              mode={panelIntent.mode}
              icmsId={panelIntent.mode === "edit" ? panelIntent.icmsId : undefined}
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
                <Landmark className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">ICMS</h2>
                <p className="text-sm text-gray-600 dark:text-slate-400">
                  Consulte descrições cadastradas e mantenha os registros no mesmo fluxo.
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
              Novo ICMS
            </button>
          ) : null}
        </div>

        <form className="mt-3 space-y-2.5" onSubmit={handleSubmit}>
          <div className="space-y-1.5">
            <span className="block text-sm font-medium text-gray-700 dark:text-slate-300">
              Descrições
            </span>
            <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400 dark:text-slate-500" />
                <input
                  type="text"
                  value={filterValue}
                  onChange={(event) => setFilterValue(event.target.value)}
                  placeholder="Ex.: substituição tributária, bebidas frias"
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
                      setSearchTerms([]);
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
              Digite parte da descricao ou use virgulas para consultar mais de um termo.
            </p>
          </div>
        </form>
      </div>

      {listQuery.isLoading && !listQuery.data ? (
        <FiscalStateBox icon={Loader2} tone="loading" title="Buscando ICMS" compact>
          Estamos consultando os registros fiscais.
        </FiscalStateBox>
      ) : null}

      {listQuery.error && !listQuery.data ? (
        <FiscalStateBox icon={AlertCircle} tone="danger" title="Não foi possível carregar a lista de ICMS" compact>
          {errorMessage}
        </FiscalStateBox>
      ) : null}

      {listQuery.data ? (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {listQuery.data.data.length === 1
                  ? "1 registro encontrado"
                  : `${listQuery.data.total} registros encontrados`}
              </p>
              <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">
                Busca atual: {searchTerms.length > 0 ? searchLabel : "Listagem geral"}
              </p>
            </div>

            {listQuery.isFetching ? (
              <div className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700 dark:border-blue-900/40 dark:bg-blue-950/20 dark:text-blue-300">
                <Loader2 className="h-4 w-4 animate-spin" />
                Atualizando resultados
              </div>
            ) : null}
          </div>

          {listQuery.error ? (
            <FiscalStateBox icon={AlertCircle} tone="danger" title="Não foi possível atualizar a listagem" compact>
              {errorMessage}
            </FiscalStateBox>
          ) : null}

          {listQuery.data.data.length > 0 ? (
            <FiscalIcmsTable
              items={listQuery.data.data}
              onEdit={canEdit ? (item) => setPanelIntent({ mode: "edit", icmsId: item.id }) : undefined}
              onDelete={canDelete ? (item) => setDeleteTarget(item) : undefined}
              isDeleting={deleteMutation.isPending}
            />
          ) : (
            <FiscalStateBox icon={Landmark} title="Nenhum ICMS encontrado" compact>
              Não localizamos registros para as descrições informadas. Revise os termos da busca e tente novamente.
            </FiscalStateBox>
          )}

          <PaginationControls
            page={listQuery.data.page}
            limit={listQuery.data.limit}
            total={listQuery.data.total}
            count={listQuery.data.data.length}
            hasMore={listQuery.data.hasMore}
            isFetching={listQuery.isFetching}
            onPrevious={() => setPage((currentPage) => Math.max(1, currentPage - 1))}
            onNext={() => setPage((currentPage) => currentPage + 1)}
          />
        </div>
      ) : null}

      <ConfirmationDialog
        open={Boolean(deleteTarget)}
        onOpenChange={handleDeleteDialogOpenChange}
        title="Excluir ICMS"
        description={`Excluir o ICMS ${deleteTarget?.state ?? ""} · ${deleteTarget?.description ?? ""}? Esta ação remove o cadastro fiscal selecionado.`}
        onConfirm={handleConfirmDelete}
        isConfirming={deleteMutation.isPending}
        errorMessage={null}
        confirmLabel="Confirmar exclusão"
        cancelLabel="Cancelar"
      />
    </section>
  );
}

function FiscalIcmsTable({
  items,
  onEdit,
  onDelete,
  isDeleting = false,
}: {
  items: FiscalIcms[];
  onEdit?: (item: FiscalIcms) => void;
  onDelete?: (item: FiscalIcms) => void;
  isDeleting?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      <table className="w-full table-fixed divide-y divide-gray-200 dark:divide-slate-700">
          <thead className="bg-gray-50 dark:bg-slate-800/60">
            <tr>
              <th className={`${TABLE_HEADER_CLASSNAME} w-[8%] px-4`}>
                UF
              </th>
              <th className={`${TABLE_HEADER_CLASSNAME} w-[24%]`}>
                Descrição
              </th>
              <th className={`${TABLE_HEADER_CLASSNAME} w-[10%]`}>
                Item
              </th>
              <th className={`${TABLE_HEADER_CLASSNAME} w-[10%]`}>
                CEST
              </th>
              <th className={`${TABLE_HEADER_CLASSNAME} w-[16%]`}>
                Conv.
              </th>
              <th className={`${TABLE_HEADER_CLASSNAME} w-[9%]`}>
                MVA apl.
              </th>
              <th className={`${TABLE_HEADER_CLASSNAME} w-[9%]`}>
                MVA ajust.
              </th>
              <th className={`${TABLE_HEADER_CLASSNAME} w-[8%]`}>
                MVA orig.
              </th>
              {onEdit || onDelete ? (
                <th className={`${TABLE_HEADER_CLASSNAME} w-[6%] px-3`}>
                  Ação
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
            {items.map((item) => (
              <tr key={item.id} className="align-middle hover:bg-gray-50 dark:hover:bg-slate-800/30">
                <td className={TABLE_CODE_CELL_CLASSNAME}>
                  {item.state}
                </td>
                <td className={TABLE_TEXT_CELL_CLASSNAME}>
                  {item.description}
                </td>
                <td className={TABLE_CENTER_CELL_CLASSNAME}>
                  {item.item_number ?? "—"}
                </td>
                <td className={TABLE_CENTER_CELL_CLASSNAME}>
                  {item.cest_code ?? "—"}
                </td>
                <td className={TABLE_TEXT_CELL_CLASSNAME}>
                  {item.interstate_agreement ?? "—"}
                </td>
                <td className={TABLE_CENTER_CELL_CLASSNAME}>
                  {item.applied_original_mva ?? "—"}
                </td>
                <td className={TABLE_CENTER_CELL_CLASSNAME}>
                  {item.adjusted_mva ?? "—"}
                </td>
                <td className={TABLE_CENTER_CELL_CLASSNAME}>
                  {item.original_mva ?? "—"}
                </td>
                {onEdit || onDelete ? (
                  <td className="px-3 py-2.5 text-center">
                    <div className="flex justify-center gap-1">
                      {onEdit ? (
                        <button
                          type="button"
                          onClick={() => onEdit(item)}
                          disabled={isDeleting}
                          aria-label={`Editar ICMS ${item.description}`}
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
                          aria-label={`Excluir ICMS ${item.description}`}
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
