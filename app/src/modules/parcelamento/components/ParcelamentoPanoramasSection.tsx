import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Edit3,
  FileText,
  Loader2,
  Plus,
  RefreshCw,
  WalletCards,
} from "lucide-react";

import { Dialog } from "@shared/components/ui/Dialog";

import {
  useCreateParcelamentoPanoramaMutation,
  useGenerateParcelamentoPanoramasMutation,
  useParcelamentoPanoramas,
  useUpdateParcelamentoPanoramaMutation,
} from "../hooks";
import type {
  CreateParcelamentoPanoramaPayload,
  ParcelamentoClientOption,
  ParcelamentoListFilters,
  ParcelamentoPanorama,
  ParcelamentoPanoramaGenerateResult,
  PatchParcelamentoPanoramaPayload,
} from "../types";
import { getParcelamentoErrorMessage } from "../utils/parcelamentoError";
import { ParcelamentoPanoramaForm } from "./ParcelamentoPanoramaForm";
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

const panoramaCheckFields = [
  { key: "cnd_municipal", label: "CND municipal" },
  { key: "cnd_state", label: "CND estadual" },
  { key: "cnd_federal", label: "CND federal" },
  { key: "cnd_fgts", label: "CND FGTS" },
  { key: "cnd_labor", label: "CND trabalhista" },
  { key: "protests", label: "Protestos" },
  { key: "state_tax_situation", label: "Situação estadual" },
  { key: "federal_tax_situation", label: "Situação federal" },
] as const satisfies readonly { key: keyof ParcelamentoPanorama; label: string }[];

interface ParcelamentoPanoramasSectionProps {
  selectedClient: ParcelamentoClientOption | null;
  canEdit: boolean;
}

function getCurrentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function getCompletedCount(panorama: ParcelamentoPanorama) {
  return panoramaCheckFields.filter((field) => Boolean(panorama[field.key])).length;
}

function formatBoolean(value: boolean) {
  return value ? "Sim" : "Não";
}

function formatResponsible(value: string | null) {
  return value?.trim() ? value : "Sem responsável";
}

function GenerateResultSummary({ result }: { result: ParcelamentoPanoramaGenerateResult }) {
  return (
    <div className="mt-3 grid gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-900 dark:border-blue-900/40 dark:bg-blue-950/20 dark:text-blue-100 sm:grid-cols-3">
      <p>
        <span className="font-semibold">{result.created}</span> criados
      </p>
      <p>
        <span className="font-semibold">{result.existing}</span> já existentes
      </p>
      <p>
        <span className="font-semibold">{result.totalActiveClients}</span> clientes ativos
      </p>
    </div>
  );
}

export function ParcelamentoPanoramasSection({
  selectedClient,
  canEdit,
}: ParcelamentoPanoramasSectionProps) {
  const [competence, setCompetence] = useState(getCurrentMonth());
  const [page, setPage] = useState(FIRST_PAGE);
  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);
  const [editingPanorama, setEditingPanorama] = useState<ParcelamentoPanorama | null>(null);
  const [isClientRequiredDialogOpen, setIsClientRequiredDialogOpen] = useState(false);
  const [generateResult, setGenerateResult] = useState<ParcelamentoPanoramaGenerateResult | null>(
    null,
  );
  const listFilters = useMemo<ParcelamentoListFilters>(
    () => ({
      client_id: selectedClient?.id,
      competence,
      page,
      page_size: PAGE_SIZE,
    }),
    [competence, page, selectedClient?.id],
  );
  const panoramasQuery = useParcelamentoPanoramas(listFilters, {
    enabled: Boolean(selectedClient),
  });
  const createMutation = useCreateParcelamentoPanoramaMutation(listFilters);
  const updateMutation = useUpdateParcelamentoPanoramaMutation(
    editingPanorama?.id ?? "",
    listFilters,
  );
  const generateMutation = useGenerateParcelamentoPanoramasMutation(listFilters);
  const isSubmitting = createMutation.isPending || updateMutation.isPending;
  const panoramas = panoramasQuery.data?.items ?? [];
  const total = panoramasQuery.data?.total ?? 0;
  const totalPages = Math.max(FIRST_PAGE, Math.ceil(total / PAGE_SIZE));
  const hasPreviousPage = page > FIRST_PAGE;
  const hasNextPage = Boolean(panoramasQuery.data?.has_more) || page < totalPages;
  const generateErrorMessage = generateMutation.error
    ? getParcelamentoErrorMessage(
        generateMutation.error,
        "Não foi possível gerar panoramas para a competência.",
      )
    : null;

  useEffect(() => {
    setPage(FIRST_PAGE);
    closeForm();
  }, [selectedClient?.id]);

  function closeForm() {
    setFormMode(null);
    setEditingPanorama(null);
    createMutation.reset();
    updateMutation.reset();
  }

  function setSafePage(nextPage: number) {
    setPage(Math.min(totalPages, Math.max(FIRST_PAGE, nextPage)));
  }

  function handleCompetenceChange(value: string) {
    setCompetence(value);
    setPage(FIRST_PAGE);
    setGenerateResult(null);
    generateMutation.reset();
  }

  function handleCreateButtonClick() {
    if (isSubmitting) {
      return;
    }

    if (!selectedClient) {
      setIsClientRequiredDialogOpen(true);
      return;
    }

    createMutation.reset();
    updateMutation.reset();
    setEditingPanorama(null);
    setFormMode("create");
  }

  function openEditForm(panorama: ParcelamentoPanorama) {
    createMutation.reset();
    updateMutation.reset();
    setEditingPanorama(panorama);
    setFormMode("edit");
  }

  async function handleCreate(payload: CreateParcelamentoPanoramaPayload) {
    await createMutation.mutateAsync(payload);
    closeForm();
  }

  async function handleUpdate(payload: PatchParcelamentoPanoramaPayload) {
    if (!editingPanorama) {
      return;
    }

    await updateMutation.mutateAsync(payload);
    closeForm();
  }

  async function handleGenerate() {
    if (competence.trim().length === 0 || generateMutation.isPending) {
      return;
    }

    setGenerateResult(null);

    try {
      const result = await generateMutation.mutateAsync(competence);
      setGenerateResult(result);
    } catch {
      setGenerateResult(null);
    }
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <WalletCards className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Panoramas</h2>
          </div>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            {selectedClient
              ? `${total} registros encontrados.`
              : "Selecione um cliente para listar os panoramas."}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => panoramasQuery.refetch()}
            disabled={!selectedClient || panoramasQuery.isFetching}
            className={parcelamentoSecondaryButtonClassName}
          >
            {panoramasQuery.isFetching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Atualizar
          </button>
          {canEdit ? (
            <>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={competence.trim().length === 0 || generateMutation.isPending}
                className={parcelamentoSecondaryButtonClassName}
              >
                {generateMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Gerar panoramas
              </button>
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
            </>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
        <label className="flex w-full flex-col gap-1 text-sm text-gray-700 dark:text-gray-300 sm:w-44">
          Competência
          <input
            type="month"
            value={competence}
            onChange={(event) => handleCompetenceChange(event.target.value)}
            aria-label="Competência"
            className={`${parcelamentoTextFieldClassName} !h-8 !py-1 shadow-none`}
          />
        </label>

        <div className="flex flex-wrap items-center justify-start gap-2 lg:justify-end">
          <button
            type="button"
            aria-label="Primeira página"
            title="Primeira página"
            onClick={() => setPage(FIRST_PAGE)}
            disabled={!hasPreviousPage || panoramasQuery.isFetching}
            className={paginationButtonClassName}
          >
            <ChevronsLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setSafePage(page - 1)}
            disabled={!hasPreviousPage || panoramasQuery.isFetching}
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
            disabled={!hasNextPage || panoramasQuery.isFetching}
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
            disabled={page >= totalPages || panoramasQuery.isFetching}
            className={paginationButtonClassName}
          >
            <ChevronsRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {generateErrorMessage ? (
        <p className="mt-3 text-sm text-red-600 dark:text-red-300">{generateErrorMessage}</p>
      ) : null}
      {generateResult ? <GenerateResultSummary result={generateResult} /> : null}

      <Dialog
        open={formMode !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            closeForm();
          }
        }}
        title={formMode === "edit" ? "Editar panorama" : "Novo panorama"}
        description="Formulário de panorama."
        contentClassName="w-[min(94vw,920px)]"
        bodyClassName="py-3"
      >
        {formMode ? (
          <ParcelamentoPanoramaForm
            selectedClient={selectedClient}
            canEdit={canEdit}
            initialValue={editingPanorama}
            isSubmitting={isSubmitting}
            submitError={formMode === "edit" ? updateMutation.error : createMutation.error}
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
        description="Selecione um cliente antes de criar um panorama."
        contentClassName="w-[min(92vw,420px)]"
        bodyClassName="space-y-4"
      >
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Para criar um panorama, primeiro selecione o cliente no topo da tela.
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
            icon={WalletCards}
            title="Selecione um cliente para ver os panoramas"
            description="Escolha um cliente no topo da tela para carregar os panoramas dele."
          />
        ) : panoramasQuery.isLoading ? (
          <ParcelamentoStateBox
            icon={Loader2}
            title="Carregando panoramas"
            description="Buscando registros mensais do cliente selecionado."
          />
        ) : panoramasQuery.isError ? (
          <ParcelamentoStateBox
            icon={AlertCircle}
            title="Não foi possível carregar"
            description={getParcelamentoErrorMessage(
              panoramasQuery.error,
              "Tente novamente em alguns instantes.",
            )}
            tone="error"
          />
        ) : panoramas.length === 0 ? (
          <ParcelamentoStateBox
            icon={FileText}
            title="Nenhum panorama encontrado"
            description="Crie ou gere panoramas para a competência selecionada."
          />
        ) : (
          <div className="grid gap-3">
            {panoramas.map((panorama) => {
              const completedCount = getCompletedCount(panorama);

              return (
                <article
                  key={panorama.id}
                  className="grid gap-3 rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-700 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start"
                >
                  <div className="min-w-0">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h4 className="text-base font-semibold text-gray-900 dark:text-white">
                          Competência {panorama.competence}
                        </h4>
                        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                          Responsável: {formatResponsible(panorama.responsavel_id)}
                        </p>
                      </div>
                      <span className="w-fit rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                        {completedCount}/{panoramaCheckFields.length} itens
                      </span>
                    </div>

                    <dl className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                      {panoramaCheckFields.map((field) => (
                        <div key={field.key} className="rounded-lg border border-gray-200 px-2 py-1.5 dark:border-gray-700">
                          <dt className="text-xs text-gray-500 dark:text-gray-400">
                            {field.label}
                          </dt>
                          <dd className="mt-0.5 font-medium text-gray-900 dark:text-white">
                            {formatBoolean(Boolean(panorama[field.key]))}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>

                  {canEdit ? (
                    <div className="flex justify-start sm:min-w-24 sm:justify-end">
                      <button
                        type="button"
                        onClick={() => openEditForm(panorama)}
                        className={`${parcelamentoSecondaryButtonClassName} min-h-10 min-w-28`}
                      >
                        <Edit3 className="h-4 w-4" />
                        Editar
                      </button>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
