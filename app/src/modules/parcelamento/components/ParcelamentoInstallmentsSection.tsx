import { useDeferredValue, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  AlertCircle,
  BadgeDollarSign,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Edit3,
  Loader2,
  Plus,
  RefreshCw,
  Search,
} from "lucide-react";

import { Dialog } from "@shared/components/ui/Dialog";

import {
  useCreateParcelamentoInstallmentMutation,
  useParcelamentoInstallments,
  useUpdateParcelamentoInstallmentMutation,
} from "../hooks";
import type {
  CreateParcelamentoInstallmentPayload,
  ParcelamentoClientOption,
  ParcelamentoInstallment,
  ParcelamentoListFilters,
  PatchParcelamentoInstallmentPayload,
} from "../types";
import { getParcelamentoErrorMessage } from "../utils/parcelamentoError";
import {
  INSTALLMENT_STATUS_OPTIONS,
  ParcelamentoInstallmentForm,
} from "./ParcelamentoInstallmentForm";
import { ParcelamentoNativeSelect } from "./ParcelamentoNativeSelect";
import { ParcelamentoStateBox } from "./ParcelamentoStateBox";
import {
  parcelamentoPrimaryButtonClassName,
  parcelamentoSecondaryButtonClassName,
  parcelamentoTextFieldClassName,
} from "./parcelamentoFormControls";

interface ParcelamentoInstallmentsSectionProps {
  selectedClient: ParcelamentoClientOption | null;
  canEdit: boolean;
  filters: ParcelamentoListFilters;
}

const FIRST_PAGE = 1;
const PAGE_SIZE_OPTIONS = [25, 50, 100];
const INSTALLMENT_TYPE_OPTIONS = ["Federal", "Estadual", "Municipal", "Simplificado", "SIMPLES"];
const INSTALLMENT_JURISDICTION_OPTIONS = ["PGFN", "RFB", "Federal", "Estadual", "Municipal"];
const paginationButtonClassName =
  "inline-flex h-8 min-w-8 items-center justify-center gap-1 rounded-lg border border-gray-300 px-2 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat("pt-BR").format(new Date(value)) : "-";
}

function getSelectOptions(
  presetOptions: readonly string[],
  currentValue: string,
  itemValues: readonly string[],
) {
  return Array.from(
    new Set(
      [currentValue, ...presetOptions, ...itemValues].filter(
        (value) => value.trim().length > 0,
      ),
    ),
  );
}

export function ParcelamentoInstallmentsSection({
  selectedClient,
  canEdit,
  filters,
}: ParcelamentoInstallmentsSectionProps) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [jurisdiction, setJurisdiction] = useState("");
  const [page, setPage] = useState(FIRST_PAGE);
  const [pageSize, setPageSize] = useState(filters.page_size ?? 50);
  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);
  const [isClientRequiredDialogOpen, setIsClientRequiredDialogOpen] = useState(false);
  const [editingInstallment, setEditingInstallment] = useState<ParcelamentoInstallment | null>(
    null,
  );
  const deferredSearch = useDeferredValue(search.trim());
  const listFilters = useMemo<ParcelamentoListFilters>(
    () => ({
      ...filters,
      client_id: selectedClient?.id,
      page,
      page_size: pageSize,
      search: deferredSearch,
      status,
      type,
      jurisdiction,
    }),
    [deferredSearch, filters, jurisdiction, page, pageSize, selectedClient?.id, status, type],
  );
  const installmentsQuery = useParcelamentoInstallments(listFilters, {
    enabled: Boolean(selectedClient),
  });
  const createMutation = useCreateParcelamentoInstallmentMutation(listFilters);
  const updateMutation = useUpdateParcelamentoInstallmentMutation(
    editingInstallment?.id ?? "",
    listFilters,
  );
  const isSubmitting = createMutation.isPending || updateMutation.isPending;
  const installments = installmentsQuery.data?.items ?? [];
  const total = installmentsQuery.data?.total ?? installments.length;
  const totalPages = Math.max(FIRST_PAGE, Math.ceil(total / pageSize));
  const hasNextPage = Boolean(installmentsQuery.data?.has_more) || page < totalPages;
  const hasPreviousPage = page > FIRST_PAGE;
  const statusOptions = getSelectOptions(
    INSTALLMENT_STATUS_OPTIONS,
    status,
    installments.map((installment) => installment.status),
  );
  const typeOptions = getSelectOptions(
    INSTALLMENT_TYPE_OPTIONS,
    type,
    installments.map((installment) => installment.type),
  );
  const jurisdictionOptions = getSelectOptions(
    INSTALLMENT_JURISDICTION_OPTIONS,
    jurisdiction,
    installments.map((installment) => installment.jurisdiction),
  );

  useEffect(() => {
    setPage(FIRST_PAGE);
  }, [selectedClient?.id]);

  function resetToFirstPage() {
    setPage(FIRST_PAGE);
  }

  function setSafePage(nextPage: number) {
    setPage(Math.min(totalPages, Math.max(FIRST_PAGE, nextPage)));
  }

  function handlePageChange(value: string) {
    const nextPage = Math.trunc(Number(value));

    if (!Number.isFinite(nextPage)) {
      return;
    }

    setSafePage(nextPage);
  }

  function handleFiltersSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    resetToFirstPage();
  }

  function openCreateForm() {
    createMutation.reset();
    updateMutation.reset();
    setEditingInstallment(null);
    setFormMode("create");
  }

  function handleCreateButtonClick() {
    if (isSubmitting) {
      return;
    }

    if (!selectedClient) {
      setIsClientRequiredDialogOpen(true);
      return;
    }

    openCreateForm();
  }

  function openEditForm(installment: ParcelamentoInstallment) {
    createMutation.reset();
    updateMutation.reset();
    setEditingInstallment(installment);
    setFormMode("edit");
  }

  function closeForm() {
    setFormMode(null);
    setEditingInstallment(null);
    createMutation.reset();
    updateMutation.reset();
  }

  async function handleCreate(payload: CreateParcelamentoInstallmentPayload) {
    await createMutation.mutateAsync(payload);
    closeForm();
  }

  async function handleUpdate(payload: PatchParcelamentoInstallmentPayload) {
    if (!editingInstallment) {
      return;
    }

    await updateMutation.mutateAsync(payload);
    closeForm();
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <BadgeDollarSign className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Parcelamentos</h2>
          </div>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            {selectedClient
              ? `${total} registros encontrados.`
              : "Selecione um cliente para listar os parcelamentos."}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => installmentsQuery.refetch()}
            disabled={!selectedClient || installmentsQuery.isFetching}
            className={parcelamentoSecondaryButtonClassName}
          >
            {installmentsQuery.isFetching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Atualizar
          </button>
          {canEdit ? (
            <button
              type="button"
              onClick={handleCreateButtonClick}
              disabled={isSubmitting}
              aria-disabled={!selectedClient || isSubmitting}
              className={`${parcelamentoPrimaryButtonClassName} ${
                !selectedClient ? "cursor-not-allowed opacity-60" : ""
              }`}
            >
              <Plus className="h-4 w-4" />
              Novo
            </button>
          ) : null}
        </div>
      </div>

      <form onSubmit={handleFiltersSubmit} className="mt-3 flex flex-wrap justify-between gap-2">
        <label className="flex w-full flex-col gap-1 text-sm text-gray-700 dark:text-gray-300 sm:w-72">
          Busca
          <span className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                resetToFirstPage();
              }}
              className={`${parcelamentoTextFieldClassName} !h-8 !py-1 !pl-8 shadow-none`}
            />
          </span>
        </label>
        <SelectFilter
          label="Status"
          value={status}
          options={statusOptions}
          emptyLabel="Todos"
          onChange={setStatus}
          onReset={resetToFirstPage}
        />
        <SelectFilter
          label="Tipo"
          value={type}
          options={typeOptions}
          emptyLabel="Todos"
          onChange={setType}
          onReset={resetToFirstPage}
        />
        <SelectFilter
          label="Jurisdição"
          value={jurisdiction}
          options={jurisdictionOptions}
          emptyLabel="Todas"
          onChange={setJurisdiction}
          onReset={resetToFirstPage}
        />
        <label className="flex w-24 flex-col gap-1 text-sm text-gray-700 dark:text-gray-300">
          Itens
          <ParcelamentoNativeSelect
            value={pageSize}
            onChange={(event) => {
              setPageSize(Number(event.target.value));
              resetToFirstPage();
            }}
            selectClassName="!h-8 !py-1 !pl-2 !pr-8 shadow-none"
            wrapperClassName="w-full"
          >
            {PAGE_SIZE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </ParcelamentoNativeSelect>
        </label>
      </form>

      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            aria-label="Primeira página"
            title="Primeira página"
            onClick={() => setPage(FIRST_PAGE)}
            disabled={!hasPreviousPage || installmentsQuery.isFetching}
            className={paginationButtonClassName}
          >
            <ChevronsLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setSafePage(page - 1)}
            disabled={!hasPreviousPage || installmentsQuery.isFetching}
            className={paginationButtonClassName}
          >
            <ChevronLeft className="h-4 w-4" />
            Anterior
          </button>
          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            Página
            <input
              type="number"
              min={FIRST_PAGE}
              max={totalPages}
              value={page}
              onChange={(event) => handlePageChange(event.target.value)}
              aria-label="Página atual"
              className="h-8 w-9 [appearance:textfield] rounded-lg border border-gray-300 bg-white px-0.5 text-center text-sm text-gray-900 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
            de {totalPages}
          </label>
          <button
            type="button"
            onClick={() => setSafePage(page + 1)}
            disabled={!hasNextPage || installmentsQuery.isFetching}
            className={paginationButtonClassName}
          >
            Próxima
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Última página"
            title="Última página"
            onClick={() => setPage(totalPages)}
            disabled={page >= totalPages || installmentsQuery.isFetching}
            className={paginationButtonClassName}
          >
            <ChevronsRight className="h-4 w-4" />
          </button>
      </div>

      <Dialog
        open={formMode !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            closeForm();
          }
        }}
        title={formMode === "edit" ? "Editar parcelamento" : "Novo parcelamento"}
        description="Formulário de parcelamento."
        contentClassName="w-[min(94vw,920px)]"
        bodyClassName="max-h-[72vh] overflow-y-auto"
      >
        {formMode ? (
          <ParcelamentoInstallmentForm
            mode={formMode}
            installment={editingInstallment}
            selectedClient={selectedClient}
            canEdit={canEdit}
            isSubmitting={isSubmitting}
            onCancel={closeForm}
            onCreate={handleCreate}
            onUpdate={handleUpdate}
          />
        ) : null}
      </Dialog>

      <Dialog
        open={isClientRequiredDialogOpen}
        onOpenChange={setIsClientRequiredDialogOpen}
        title="Selecione um cliente"
        description="Selecione um cliente antes de criar um parcelamento."
        contentClassName="w-[min(92vw,420px)]"
        bodyClassName="space-y-4"
      >
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Para criar um parcelamento, primeiro selecione o cliente no topo da tela.
        </p>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setIsClientRequiredDialogOpen(false)}
            className={parcelamentoPrimaryButtonClassName}
          >
            Entendi
          </button>
        </div>
      </Dialog>

      <div className="mt-4">
        {!selectedClient ? (
          <ParcelamentoStateBox
            icon={BadgeDollarSign}
            title="Selecione um cliente para ver os parcelamentos"
            description="Escolha um cliente no topo da tela para carregar somente os parcelamentos dele."
          />
        ) : installmentsQuery.isLoading ? (
          <ParcelamentoStateBox
            icon={Loader2}
            title="Carregando parcelamentos"
            description="Buscando registros reais do módulo."
          />
        ) : installmentsQuery.isError ? (
          <ParcelamentoStateBox
            icon={AlertCircle}
            title="Não foi possível carregar"
            description={getParcelamentoErrorMessage(
              installmentsQuery.error,
              "Tente novamente em alguns instantes.",
            )}
            tone="error"
          />
        ) : installments.length === 0 ? (
          <ParcelamentoStateBox
            icon={BadgeDollarSign}
            title="Nenhum parcelamento encontrado"
            description="A lista será exibida assim que houver dados reais para o filtro atual."
          />
        ) : (
          <div className="grid gap-3">
            {installments.map((installment) => (
              <article
                key={installment.id}
                className="grid gap-3 rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-700 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
              >
                <div className="min-w-0">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                      {installment.type} - {installment.jurisdiction}
                    </h3>
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                      {installment.agreement_number || "Sem número de acordo"}
                    </p>
                  </div>

                  <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-[minmax(6rem,1fr)_minmax(4rem,0.7fr)_minmax(5rem,0.8fr)_minmax(7rem,1fr)_minmax(5rem,0.75fr)_minmax(5rem,0.75fr)]">
                    <DataPoint
                      label="Parcela atual"
                      value={formatCurrency(installment.current_month_installment_amount)}
                    />
                    <DataPoint
                      label="Pagas"
                      value={`${installment.paid_installments_count}/${installment.agreed_installments_count}`}
                    />
                    <DataPoint label="Vencidas" value={installment.overdue_installments_count} />
                    <DataPoint
                      label="Saldo"
                      value={formatCurrency(installment.outstanding_balance)}
                    />
                    <DataPoint label="Adesão" value={formatDate(installment.enrollment_date)} />
                    <div className="text-center">
                      <dt className="text-xs text-gray-500 dark:text-gray-400">Status</dt>
                      <dd className="mt-0.5 flex justify-center">
                        <span className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                          {installment.status}
                        </span>
                      </dd>
                    </div>
                  </dl>
                </div>

                {canEdit ? (
                  <div className="flex justify-start sm:min-w-24 sm:justify-end">
                    <button
                      type="button"
                      onClick={() => openEditForm(installment)}
                      className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-gray-300 px-2 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                    >
                      <Edit3 className="h-4 w-4" />
                      Editar
                    </button>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function SelectFilter({
  emptyLabel,
  label,
  onChange,
  onReset,
  options,
  value,
}: {
  emptyLabel: string;
  label: string;
  onChange: (value: string) => void;
  onReset: () => void;
  options: string[];
  value: string;
}) {
  return (
    <label className="flex w-full flex-col gap-1 text-sm text-gray-700 dark:text-gray-300 sm:w-40">
      {label}
      <ParcelamentoNativeSelect
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          onReset();
        }}
        selectClassName="!h-8 !py-1 !pl-2 !pr-8 shadow-none"
      >
        <option value="">{emptyLabel}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </ParcelamentoNativeSelect>
    </label>
  );
}

function DataPoint({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="text-center">
      <dt className="text-xs text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="font-medium text-gray-900 dark:text-white">{value}</dd>
    </div>
  );
}
