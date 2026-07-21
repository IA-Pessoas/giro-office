import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ClipboardList,
  Edit3,
  FileText,
  Loader2,
  Plus,
} from "lucide-react";

import { Dialog } from "@shared/components/ui/Dialog";

import {
  useCreateParcelamentoCompetency,
  useParcelamentoCompetencies,
  useParcelamentoInstallments,
  useUpdateParcelamentoCompetency,
} from "../hooks";
import type {
  CreateParcelamentoInstallmentCompetencyPayload,
  ParcelamentoClientOption,
  ParcelamentoInstallment,
  ParcelamentoInstallmentCompetency,
  ParcelamentoListFilters,
  PatchParcelamentoInstallmentCompetencyPayload,
} from "../types";
import { getParcelamentoErrorMessage } from "../utils/parcelamentoError";
import { ParcelamentoCompetencyForm } from "./ParcelamentoCompetencyForm";
import { ParcelamentoStateBox } from "./ParcelamentoStateBox";
import {
  parcelamentoPrimaryButtonClassName,
  parcelamentoSecondaryButtonClassName,
  parcelamentoTextFieldClassName,
} from "./parcelamentoFormControls";

const FIRST_PAGE = 1;
const PAGE_SIZE = 50;
const paginationButtonClassName =
  "inline-flex h-8 min-w-8 items-center justify-center gap-1 rounded-lg border border-gray-300 px-2 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700";
const installmentMenuOptionClassName =
  "flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm transition-colors";

interface ParcelamentoCompetenciesSectionProps {
  selectedClient: ParcelamentoClientOption | null;
  canEdit: boolean;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatBoolean(value: boolean | null) {
  if (value === null) {
    return "Não informado";
  }

  return value ? "Sim" : "Não";
}

function installmentLabel(installment: ParcelamentoInstallment) {
  return [
    installment.agreement_number || "Sem número",
    installment.type,
    installment.jurisdiction,
    installment.status,
  ].join(" - ");
}

function DataPoint({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <dt className="text-xs text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="font-medium text-gray-900 dark:text-white">{value}</dd>
    </div>
  );
}

function getInstallmentMenuOptionClassName(isSelected: boolean) {
  return `${installmentMenuOptionClassName} ${
    isSelected
      ? "bg-blue-100 font-medium text-blue-900 dark:bg-blue-500/20 dark:text-blue-100"
      : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
  }`;
}

export function ParcelamentoCompetenciesSection({
  selectedClient,
  canEdit,
}: ParcelamentoCompetenciesSectionProps) {
  const [selectedInstallmentId, setSelectedInstallmentId] = useState("");
  const [isInstallmentMenuOpen, setIsInstallmentMenuOpen] = useState(false);
  const [page, setPage] = useState(FIRST_PAGE);
  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);
  const [editingCompetency, setEditingCompetency] =
    useState<ParcelamentoInstallmentCompetency | null>(null);
  const installmentFilters = useMemo<ParcelamentoListFilters>(
    () => ({
      client_id: selectedClient?.id,
      page: FIRST_PAGE,
      page_size: PAGE_SIZE,
    }),
    [selectedClient?.id],
  );
  const competencyFilters = useMemo<ParcelamentoListFilters>(
    () => ({
      page,
      page_size: PAGE_SIZE,
    }),
    [page],
  );
  const installmentsQuery = useParcelamentoInstallments(installmentFilters, { enabled: true });
  const installments = installmentsQuery.data?.items ?? [];
  const competenciesQuery = useParcelamentoCompetencies(
    selectedInstallmentId,
    competencyFilters,
    { enabled: Boolean(selectedInstallmentId) },
  );
  const createMutation = useCreateParcelamentoCompetency();
  const updateMutation = useUpdateParcelamentoCompetency();
  const competencies = competenciesQuery.data?.items ?? [];
  const total = competenciesQuery.data?.total ?? 0;
  const totalPages = Math.max(FIRST_PAGE, Math.ceil(total / PAGE_SIZE));
  const hasPreviousPage = page > FIRST_PAGE;
  const hasNextPage = Boolean(competenciesQuery.data?.has_more) || page < totalPages;
  const selectedInstallment = installments.find(
    (installment) => installment.id === selectedInstallmentId,
  );
  const selectedInstallmentLabel = selectedInstallment
    ? installmentLabel(selectedInstallment)
    : "Selecionar parcelamento";
  const isInstallmentMenuDisabled = installmentsQuery.isLoading || installments.length === 0;
  const shouldShowInstallmentMenu = isInstallmentMenuOpen && !isInstallmentMenuDisabled;

  useEffect(() => {
    setSelectedInstallmentId("");
    setIsInstallmentMenuOpen(false);
    setPage(FIRST_PAGE);
    closeForm();
  }, [selectedClient?.id]);

  function closeForm() {
    setFormMode(null);
    setEditingCompetency(null);
    createMutation.reset();
    updateMutation.reset();
  }

  function handleInstallmentChange(value: string) {
    setIsInstallmentMenuOpen(false);
    if (value === selectedInstallmentId) {
      return;
    }

    setSelectedInstallmentId(value);
    setPage(FIRST_PAGE);
    closeForm();
  }

  function setSafePage(nextPage: number) {
    setPage(Math.min(totalPages, Math.max(FIRST_PAGE, nextPage)));
  }

  function openCreateForm() {
    createMutation.reset();
    updateMutation.reset();
    setEditingCompetency(null);
    setFormMode("create");
  }

  function openEditForm(competency: ParcelamentoInstallmentCompetency) {
    createMutation.reset();
    updateMutation.reset();
    setEditingCompetency(competency);
    setFormMode("edit");
  }

  async function handleCreate(payload: CreateParcelamentoInstallmentCompetencyPayload) {
    await createMutation.mutateAsync({ installmentId: selectedInstallmentId, payload });
    closeForm();
  }

  async function handleUpdate(payload: PatchParcelamentoInstallmentCompetencyPayload) {
    if (!editingCompetency) {
      return;
    }

    await updateMutation.mutateAsync({
      id: editingCompetency.id,
      installmentId: selectedInstallmentId,
      payload,
    });
    closeForm();
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Competências</h2>
          </div>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            {selectedInstallmentId
              ? `${total} registros encontrados.`
              : "Selecione um parcelamento para listar as competências."}
          </p>
        </div>

        {canEdit ? (
          <button
            type="button"
            onClick={openCreateForm}
            disabled={!selectedInstallmentId}
            aria-disabled={!selectedInstallmentId}
            className={`${parcelamentoPrimaryButtonClassName} ${
              !selectedInstallmentId ? "cursor-not-allowed opacity-60" : ""
            }`}
          >
            <Plus className="h-4 w-4" />
            Nova competência
          </button>
        ) : null}
      </div>

      <div className="mt-3 flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
        <div
          className="relative flex w-full flex-col gap-1 text-sm text-gray-700 dark:text-gray-300 sm:w-80 lg:w-96"
          onBlur={(event) => {
            const nextFocus = event.relatedTarget as Node | null;
            if (!event.currentTarget.contains(nextFocus)) {
              setIsInstallmentMenuOpen(false);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setIsInstallmentMenuOpen(false);
            }
          }}
        >
          <span id="parcelamento-installment-label">Parcelamento</span>
          <button
            type="button"
            aria-labelledby="parcelamento-installment-label"
            aria-haspopup="listbox"
            aria-expanded={shouldShowInstallmentMenu}
            disabled={isInstallmentMenuDisabled}
            onClick={() => setIsInstallmentMenuOpen((isOpen) => !isOpen)}
            className={`${parcelamentoTextFieldClassName} flex !h-8 items-center justify-between gap-2 !py-1 !pl-2 !pr-2 text-left shadow-none`}
          >
            <span className="truncate">{selectedInstallmentLabel}</span>
            <ChevronDown
              aria-hidden="true"
              className={`h-4 w-4 shrink-0 text-gray-500 transition-transform dark:text-gray-400 ${
                shouldShowInstallmentMenu ? "rotate-180" : ""
              }`}
            />
          </button>

          {shouldShowInstallmentMenu ? (
            <div
              role="listbox"
              aria-labelledby="parcelamento-installment-label"
              className="absolute left-0 top-full z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-gray-300 bg-white p-1 shadow-lg dark:border-gray-600 dark:bg-gray-800"
            >
              <button
                type="button"
                role="option"
                aria-selected={selectedInstallmentId === ""}
                onClick={() => handleInstallmentChange("")}
                className={getInstallmentMenuOptionClassName(selectedInstallmentId === "")}
              >
                Selecionar parcelamento
              </button>
              {installments.map((installment) => {
                const isSelected = installment.id === selectedInstallmentId;

                return (
                  <button
                    key={installment.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleInstallmentChange(installment.id)}
                    className={getInstallmentMenuOptionClassName(isSelected)}
                  >
                    <span className="truncate">{installmentLabel(installment)}</span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-start gap-2 lg:justify-end">
          <button
            type="button"
            aria-label="Primeira página"
            title="Primeira página"
            onClick={() => setPage(FIRST_PAGE)}
            disabled={!hasPreviousPage || competenciesQuery.isFetching}
            className={paginationButtonClassName}
          >
            <ChevronsLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setSafePage(page - 1)}
            disabled={!hasPreviousPage || competenciesQuery.isFetching}
            className={paginationButtonClassName}
          >
            <ChevronLeft className="h-4 w-4" />
            Anterior
          </button>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Página {page} de {totalPages}
          </p>
          <button
            type="button"
            onClick={() => setSafePage(page + 1)}
            disabled={!hasNextPage || competenciesQuery.isFetching}
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
            disabled={page >= totalPages || competenciesQuery.isFetching}
            className={paginationButtonClassName}
          >
            <ChevronsRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {installmentsQuery.isError ? (
        <p className="mt-3 text-sm text-red-600 dark:text-red-300">
          {getParcelamentoErrorMessage(
            installmentsQuery.error,
            "Não foi possível carregar os parcelamentos.",
          )}
        </p>
      ) : null}

      <Dialog
        open={formMode !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            closeForm();
          }
        }}
        title={formMode === "edit" ? "Editar competência" : "Nova competência"}
        description="Formulário de competência."
        contentClassName="w-[min(94vw,920px)]"
        bodyClassName="max-h-[72vh] overflow-y-auto"
      >
        {formMode ? (
          <ParcelamentoCompetencyForm
            canEdit={canEdit}
            initialValue={editingCompetency}
            isSubmitting={formMode === "edit" ? updateMutation.isPending : createMutation.isPending}
            submitError={formMode === "edit" ? updateMutation.error : createMutation.error}
            onCancel={closeForm}
            onCreate={handleCreate}
            onUpdate={handleUpdate}
          />
        ) : null}
      </Dialog>

      <div className="mt-4">
        {!selectedInstallmentId ? (
          <ParcelamentoStateBox
            icon={FileText}
            title="Selecione um parcelamento"
            description="As competências aparecem depois da seleção do parcelamento."
          />
        ) : competenciesQuery.isLoading ? (
          <ParcelamentoStateBox
            icon={Loader2}
            title="Carregando competências"
            description="Buscando registros mensais do parcelamento selecionado."
          />
        ) : competenciesQuery.isError ? (
          <ParcelamentoStateBox
            icon={AlertCircle}
            title="Não foi possível carregar"
            description={getParcelamentoErrorMessage(
              competenciesQuery.error,
              "Tente novamente em alguns instantes.",
            )}
            tone="error"
          />
        ) : competencies.length === 0 ? (
          <ParcelamentoStateBox
            icon={FileText}
            title="Nenhuma competência encontrada"
            description="Crie o primeiro registro mensal quando houver dados disponíveis."
          />
        ) : (
          <div className="grid gap-3">
            {competencies.map((competency) => (
              <article
                key={competency.id}
                className="grid gap-3 rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-700 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
              >
                <div className="min-w-0">
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                      Competência {competency.competence}
                    </h4>
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                      Valor {formatCurrency(competency.installment_amount)}
                    </p>
                  </div>

                  <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-[minmax(4rem,0.7fr)_minmax(5rem,0.8fr)_minmax(5rem,0.8fr)_minmax(5rem,0.8fr)_minmax(5rem,0.8fr)]">
                    <DataPoint label="Pagas" value={String(competency.how_many_paid)} />
                    <DataPoint label="Vencidas" value={String(competency.how_many_overdue)} />
                    <DataPoint label="Download" value={competency.download ? "Sim" : "Não"} />
                    <DataPoint label="Upload" value={formatBoolean(competency.upload_file)} />
                    <DataPoint label="Enviado" value={formatBoolean(competency.is_sent)} />
                  </dl>

                  {competency.notes || competency.download_notes || competency.submission_type ? (
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                      {competency.notes ??
                        competency.download_notes ??
                        competency.submission_type}
                    </p>
                  ) : null}
                </div>

                {canEdit ? (
                  <div className="flex justify-start sm:min-w-24 sm:justify-end">
                    <button
                      type="button"
                      onClick={() => openEditForm(competency)}
                      className={parcelamentoSecondaryButtonClassName}
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
