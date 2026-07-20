import { useDeferredValue, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  AlertCircle,
  BadgeDollarSign,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Loader2,
  Plus,
  RefreshCw,
  Search,
} from "lucide-react";

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
import { ParcelamentoInstallmentForm } from "./ParcelamentoInstallmentForm";
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

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat("pt-BR").format(new Date(value)) : "-";
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
  const installmentsQuery = useParcelamentoInstallments(listFilters);
  const createMutation = useCreateParcelamentoInstallmentMutation(listFilters);
  const updateMutation = useUpdateParcelamentoInstallmentMutation(
    editingInstallment?.id ?? "",
    listFilters,
  );
  const isSubmitting = createMutation.isPending || updateMutation.isPending;
  const installments = installmentsQuery.data?.items ?? [];
  const hasNextPage = Boolean(installmentsQuery.data?.has_more);
  const hasPreviousPage = page > FIRST_PAGE;

  useEffect(() => {
    setPage(FIRST_PAGE);
  }, [selectedClient?.id]);

  function resetToFirstPage() {
    setPage(FIRST_PAGE);
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
            {installmentsQuery.data?.total ?? installments.length} registros encontrados.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => installmentsQuery.refetch()}
            disabled={installmentsQuery.isFetching}
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
              onClick={openCreateForm}
              disabled={!selectedClient || isSubmitting}
              className={parcelamentoPrimaryButtonClassName}
            >
              <Plus className="h-4 w-4" />
              Novo
            </button>
          ) : null}
        </div>
      </div>

      <form onSubmit={handleFiltersSubmit} className="mt-4 grid gap-3 lg:grid-cols-5">
        <label className="flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-300 lg:col-span-2">
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
              className={`${parcelamentoTextFieldClassName} pl-9`}
            />
          </span>
        </label>
        <TextFilter label="Status" value={status} onChange={setStatus} onReset={resetToFirstPage} />
        <TextFilter label="Tipo" value={type} onChange={setType} onReset={resetToFirstPage} />
        <TextFilter
          label="Jurisdição"
          value={jurisdiction}
          onChange={setJurisdiction}
          onReset={resetToFirstPage}
        />
      </form>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          Itens
          <select
            value={pageSize}
            onChange={(event) => {
              setPageSize(Number(event.target.value));
              resetToFirstPage();
            }}
            className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          >
            {PAGE_SIZE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(FIRST_PAGE, current - 1))}
            disabled={!hasPreviousPage || installmentsQuery.isFetching}
            className={parcelamentoSecondaryButtonClassName}
          >
            <ChevronLeft className="h-4 w-4" />
            Anterior
          </button>
          <span className="text-sm text-gray-600 dark:text-gray-400">Página {page}</span>
          <button
            type="button"
            onClick={() => setPage((current) => current + 1)}
            disabled={!hasNextPage || installmentsQuery.isFetching}
            className={parcelamentoSecondaryButtonClassName}
          >
            Próxima
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {formMode ? (
        <div className="mt-4">
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
        </div>
      ) : null}

      <div className="mt-4">
        {installmentsQuery.isLoading ? (
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
                className="rounded-lg border border-gray-200 p-3 dark:border-gray-700"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                      {installment.type} - {installment.jurisdiction}
                    </h3>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {installment.agreement_number || "Sem número de acordo"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                      {installment.status}
                    </span>
                    {canEdit ? (
                      <button
                        type="button"
                        onClick={() => openEditForm(installment)}
                        className={parcelamentoSecondaryButtonClassName}
                      >
                        <Edit3 className="h-4 w-4" />
                        Editar
                      </button>
                    ) : null}
                  </div>
                </div>

                <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-5">
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
                </dl>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function TextFilter({
  label,
  onChange,
  onReset,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  onReset: () => void;
  value: string;
}) {
  return (
    <label className="flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-300">
      {label}
      <input
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          onReset();
        }}
        className={parcelamentoTextFieldClassName}
      />
    </label>
  );
}

function DataPoint({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <dt className="text-xs text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="font-medium text-gray-900 dark:text-white">{value}</dd>
    </div>
  );
}
