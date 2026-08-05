import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  AlertCircle,
  ChevronDown,
  ClipboardList,
  FileText,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  X,
} from "lucide-react";

import { Dialog } from "@shared/components";
import { cn } from "@shared/ui/newLayout/utils";
import { FieldHelp } from "@shared/ui/newLayout/field-help";
import { formatBrlInput, parseBrlInput } from "@shared/utils/inputFormatting";

import {
  useCreatePessoalLddMutation,
  useCreatePessoalSituationMutation,
  useDeletePessoalLddMutation,
  useDeletePessoalSituationMutation,
  usePessoalLdd,
  usePessoalSituationDetail,
  usePessoalSituations,
  useUpdatePessoalLddMutation,
  useUpdatePessoalSituationMutation,
} from "../hooks/usePessoalTracking";
import type {
  PessoalLdd,
  PessoalLddPayload,
  PessoalSituation,
  PessoalSituationStatus,
} from "../types/tracking";
import { getPessoalErrorMessage } from "../utils/pessoalErrorMessage";
import {
  pessoalDangerButtonClassName,
  pessoalPrimaryButtonClassName,
  pessoalSecondaryButtonClassName,
  pessoalTextFieldClassName,
} from "./pessoalFormControls";
import { optional } from "./pessoalFormValueHelpers";
import { PessoalPlaceholderSection } from "./PessoalPlaceholderSection";

interface PessoalTrackingSectionProps {
  selectedClientId: string;
  canEdit: boolean;
}

type TrackingTab = "ldd" | "situations";

type LddFormValues = {
  type: string;
  period: string;
  due_date: string;
  balance_amount: string;
  registration_status: string;
  status: string;
};

type SituationFormValues = {
  title: string;
  description: string;
};

const emptyLddFormValues: LddFormValues = {
  type: "",
  period: "",
  due_date: "",
  balance_amount: "",
  registration_status: "",
  status: "",
};

const emptySituationFormValues: SituationFormValues = {
  title: "",
  description: "",
};

const lddTypeOptions = ["INSS", "FGTS", "IRRF", "ISS"] as const;
const lddRegistrationStatusOptions = ["Pendente", "Cadastrado"] as const;
const lddStatusOptions = ["Pendente", "Pago", "Vencido"] as const;

const lddFields = [
  { name: "type", label: "Tipo", options: lddTypeOptions },
  {
    name: "period",
    label: "Período",
    type: "text",
    help: "Competência do período que será acompanhado no LDD.",
  },
  { name: "due_date", label: "Vencimento", type: "date" },
  {
    name: "balance_amount",
    label: "Saldo",
    type: "text",
    money: true,
    help: "Saldo atual do LDD para acompanhar o valor pendente ou devido.",
  },
  {
    name: "registration_status",
    label: "Cadastro",
    options: lddRegistrationStatusOptions,
    help: "Indica se o cadastro necessário para o LDD já foi realizado.",
  },
  {
    name: "status",
    label: "Status",
    options: lddStatusOptions,
    help: "Situação atual do LDD: pendente, pago ou vencido.",
  },
] as const;

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "-";
  }

  const [year, month, day] = value.slice(0, 10).split("-");

  return year && month && day ? `${day}/${month}/${year}` : value;
}

function buildLddFormValues(ldd: PessoalLdd | null): LddFormValues {
  if (!ldd) {
    return emptyLddFormValues;
  }

  return {
    type: ldd.type,
    period: ldd.period ?? "",
    due_date: ldd.due_date ? ldd.due_date.slice(0, 10) : "",
    balance_amount:
      typeof ldd.balance_amount === "number"
        ? formatBrlInput(String(Math.round(ldd.balance_amount * 100)))
        : "",
    registration_status: ldd.registration_status ?? "",
    status: ldd.status ?? "",
  };
}

function buildSituationFormValues(situation: PessoalSituation | null): SituationFormValues {
  if (!situation) {
    return emptySituationFormValues;
  }

  return {
    title: situation.title,
    description: situation.description,
  };
}

export function PessoalTrackingSection({
  selectedClientId,
  canEdit,
}: PessoalTrackingSectionProps) {
  const hasClient = selectedClientId.length > 0;
  const [activeTrackingTab, setActiveTrackingTab] = useState<TrackingTab>("ldd");
  const lddQuery = usePessoalLdd(selectedClientId, hasClient);
  const situationsQuery = usePessoalSituations(selectedClientId, hasClient);
  const createLddMutation = useCreatePessoalLddMutation();
  const deleteLddMutation = useDeletePessoalLddMutation(selectedClientId);
  const createSituationMutation = useCreatePessoalSituationMutation();
  const deleteSituationMutation = useDeletePessoalSituationMutation(selectedClientId);
  const [selectedLdd, setSelectedLdd] = useState<PessoalLdd | null>(null);
  const [lddToDelete, setLddToDelete] = useState<PessoalLdd | null>(null);
  const [isLddFormOpen, setIsLddFormOpen] = useState(false);
  const [lddFormValues, setLddFormValues] = useState<LddFormValues>(emptyLddFormValues);
  const updateLddMutation = useUpdatePessoalLddMutation(
    selectedLdd?.id ?? "",
    selectedClientId,
  );
  const [selectedSituationId, setSelectedSituationId] = useState("");
  const [situationToDelete, setSituationToDelete] = useState<PessoalSituation | null>(null);
  const [isSituationFormOpen, setIsSituationFormOpen] = useState(false);
  const situationDetailQuery = usePessoalSituationDetail(
    selectedSituationId,
    hasClient && selectedSituationId.length > 0,
  );
  const updateSituationMutation = useUpdatePessoalSituationMutation(selectedClientId);
  const [situationFormValues, setSituationFormValues] = useState<SituationFormValues>(
    emptySituationFormValues,
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const lddRows = lddQuery.data ?? [];
  const situationRows = situationsQuery.data ?? [];
  const selectedSituation = situationDetailQuery.data ?? null;
  const isLddSubmitting =
    createLddMutation.isPending || updateLddMutation.isPending || deleteLddMutation.isPending;
  const isSituationSubmitting =
    createSituationMutation.isPending ||
    updateSituationMutation.isPending ||
    deleteSituationMutation.isPending;

  useEffect(() => {
    setSelectedLdd(null);
    setLddToDelete(null);
    setIsLddFormOpen(false);
    setLddFormValues(emptyLddFormValues);
    setSelectedSituationId("");
    setSituationToDelete(null);
    setIsSituationFormOpen(false);
    setSituationFormValues(emptySituationFormValues);
    setFormError(null);
    setSuccessMessage(null);
  }, [selectedClientId]);

  useEffect(() => {
    if (selectedSituation) {
      setSituationFormValues(buildSituationFormValues(selectedSituation));
    }
  }, [selectedSituation]);

  if (!hasClient) {
    return (
      <PessoalPlaceholderSection
        icon={ClipboardList}
        title="Acompanhamentos"
        description="Selecione um cliente para continuar."
        requiresClient
        hasClient={false}
      />
    );
  }

  function clearFeedback() {
    setFormError(null);
    setSuccessMessage(null);
  }

  function startNewLdd() {
    clearFeedback();
    setSelectedLdd(null);
    setLddFormValues(emptyLddFormValues);
    setIsLddFormOpen(true);
  }

  function startEditLdd(ldd: PessoalLdd) {
    clearFeedback();
    setSelectedLdd(ldd);
    setLddFormValues(buildLddFormValues(ldd));
    setIsLddFormOpen(true);
  }

  function buildLddPayload(): PessoalLddPayload {
    return {
      client_id: selectedClientId,
      type: lddFormValues.type.trim(),
      period: optional(lddFormValues.period),
      due_date: optional(lddFormValues.due_date),
      balance_amount: optional(lddFormValues.balance_amount, parseBrlInput),
      registration_status: optional(lddFormValues.registration_status),
      status: optional(lddFormValues.status),
    };
  }

  async function handleLddSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canEdit) {
      return;
    }

    const payload = buildLddPayload();

    if (!payload.type) {
      setFormError("Informe o tipo do LDD.");
      return;
    }

    if (typeof payload.balance_amount === "number" && payload.balance_amount < 0) {
      setFormError("Saldo não pode ser negativo.");
      return;
    }

    clearFeedback();

    try {
      if (selectedLdd) {
        const { client_id: _clientId, ...body } = payload;
        const savedLdd = await updateLddMutation.mutateAsync(body);

        setSelectedLdd(savedLdd);
        setLddFormValues(buildLddFormValues(savedLdd));
        setIsLddFormOpen(false);
        setSuccessMessage("LDD atualizado.");
      } else {
        const savedLdd = await createLddMutation.mutateAsync(payload);

        setSelectedLdd(savedLdd);
        setLddFormValues(buildLddFormValues(savedLdd));
        setIsLddFormOpen(false);
        setSuccessMessage("LDD criado.");
      }
    } catch (error) {
      setFormError(getPessoalErrorMessage(error, "Não foi possível salvar o LDD."));
    }
  }

  function openDeleteLddDialog(ldd: PessoalLdd) {
    if (!canEdit) {
      return;
    }

    setLddToDelete(ldd);
  }

  async function handleConfirmDeleteLdd() {
    if (!canEdit || !lddToDelete) {
      return;
    }

    const ldd = lddToDelete;

    clearFeedback();

    try {
      await deleteLddMutation.mutateAsync(ldd.id);

      if (selectedLdd?.id === ldd.id) {
        startNewLdd();
        setIsLddFormOpen(false);
      }

      setLddToDelete(null);
      setSuccessMessage("LDD removido.");
    } catch (error) {
      setFormError(getPessoalErrorMessage(error, "Não foi possível remover o LDD."));
      setLddToDelete(null);
    }
  }

  function startNewSituation() {
    clearFeedback();
    setSelectedSituationId("");
    setSituationFormValues(emptySituationFormValues);
    setIsSituationFormOpen(true);
  }

  function startSituationDetail(situation: PessoalSituation) {
    clearFeedback();
    setSelectedSituationId(situation.id);
    setSituationFormValues(buildSituationFormValues(situation));
    setIsSituationFormOpen(true);
  }

  function openDeleteSituationDialog(situation: PessoalSituation) {
    if (!canEdit) {
      return;
    }

    clearFeedback();
    setSituationToDelete(situation);
  }

  async function handleConfirmDeleteSituation() {
    if (!canEdit || !situationToDelete) {
      return;
    }

    const situation = situationToDelete;

    clearFeedback();

    try {
      await deleteSituationMutation.mutateAsync(situation.id);

      if (selectedSituationId === situation.id) {
        setSelectedSituationId("");
        setSituationFormValues(emptySituationFormValues);
        setIsSituationFormOpen(false);
      }

      setSituationToDelete(null);
      setSuccessMessage("Situação removida.");
    } catch (error) {
      setFormError(getPessoalErrorMessage(error, "Não foi possível remover a situação."));
    }
  }

  async function handleSituationSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canEdit) {
      return;
    }

    const payload = {
      client_id: selectedClientId,
      title: situationFormValues.title.trim(),
      description: situationFormValues.description.trim(),
    };

    if (!payload.title || !payload.description) {
      setFormError("Informe título e descrição.");
      return;
    }

    clearFeedback();

    try {
      if (selectedSituationId) {
        await updateSituationMutation.mutateAsync({
          id: selectedSituationId,
          payload: {
            title: payload.title,
            description: payload.description,
          },
        });
        setIsSituationFormOpen(false);
        setSuccessMessage("Situação atualizada.");
      } else {
        const created = await createSituationMutation.mutateAsync(payload);

        setSelectedSituationId(created.id);
        setIsSituationFormOpen(false);
        setSuccessMessage("Situação criada.");
      }
    } catch (error) {
      setFormError(getPessoalErrorMessage(error, "Não foi possível salvar a situação."));
    }
  }

  async function handleSituationStatusChange(nextStatus: PessoalSituationStatus) {
    if (!canEdit || !selectedSituationId) {
      return;
    }

    clearFeedback();

    try {
      await updateSituationMutation.mutateAsync({
        id: selectedSituationId,
        payload: {
          status: nextStatus,
        },
      });
      setIsSituationFormOpen(false);
      setSuccessMessage(
        nextStatus === "Finalizado" ? "Situação concluída." : "Situação reaberta.",
      );
    } catch (error) {
      setFormError(
        getPessoalErrorMessage(error, "Não foi possível alterar o status da situação."),
      );
    }
  }

  return (
    <section className="space-y-6">
      <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Acompanhamentos
              </h2>
            </div>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              LDD e Situações vinculados ao cliente selecionado.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {(["ldd", "situations"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTrackingTab(tab)}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  activeTrackingTab === tab
                    ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                    : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700",
                )}
              >
                {tab === "ldd" ? "LDD" : "Situações"}
              </button>
            ))}
            <button
              type="button"
              onClick={() =>
                activeTrackingTab === "ldd" ? lddQuery.refetch() : situationsQuery.refetch()
              }
              disabled={lddQuery.isFetching || situationsQuery.isFetching}
              className={pessoalSecondaryButtonClassName}
            >
              {lddQuery.isFetching || situationsQuery.isFetching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Atualizar
            </button>
          </div>
        </div>

        <div className="mt-6">
          {activeTrackingTab === "ldd" ? (
            <TrackingListCard
              icon={FileText}
              title="LDD"
              loading={lddQuery.isLoading}
              error={lddQuery.isError ? lddQuery.error : null}
              empty={lddRows.length === 0}
              emptyMessage="Nenhum LDD cadastrado para este cliente."
              actions={
                canEdit ? (
                  <button
                    type="button"
                    onClick={startNewLdd}
                    className={pessoalPrimaryButtonClassName}
                  >
                    <Plus className="h-4 w-4" />
                    Criar LDD
                  </button>
                ) : null
              }
            >
              {lddRows.map((ldd) => (
                <div
                  key={ldd.id}
                  className={cn(
                    "rounded-lg border border-gray-200 p-4 dark:border-gray-700",
                    selectedLdd?.id === ldd.id &&
                      "border-blue-300 bg-blue-50 dark:bg-blue-950/20",
                  )}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-white">{ldd.type}</p>
                      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                        Vencimento: {formatDate(ldd.due_date)}
                      </p>
                      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                        Status: {ldd.status || "-"} | Cadastro: {ldd.registration_status || "-"}
                      </p>
                    </div>
                    {canEdit ? (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => startEditLdd(ldd)}
                          className={pessoalSecondaryButtonClassName}
                        >
                          <Pencil className="h-4 w-4" />
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => openDeleteLddDialog(ldd)}
                          disabled={deleteLddMutation.isPending}
                          className={pessoalSecondaryButtonClassName}
                        >
                          <Trash2 className="h-4 w-4" />
                          Remover
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </TrackingListCard>
          ) : (
            <TrackingListCard
              icon={ClipboardList}
              title="Situações"
              loading={situationsQuery.isLoading}
              error={situationsQuery.isError ? situationsQuery.error : null}
              empty={situationRows.length === 0}
              emptyMessage="Nenhuma situação cadastrada para este cliente."
              actions={
                canEdit ? (
                  <button
                    type="button"
                    onClick={startNewSituation}
                    className={pessoalPrimaryButtonClassName}
                  >
                    <Plus className="h-4 w-4" />
                    Criar situação
                  </button>
                ) : null
              }
            >
              {situationRows.map((situation) => (
                <div
                  key={situation.id}
                  className={cn(
                    "rounded-lg border border-gray-200 p-4 dark:border-gray-700",
                    selectedSituationId === situation.id &&
                      "border-blue-300 bg-blue-50 dark:bg-blue-950/20",
                  )}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-white">
                        {situation.title}
                      </p>
                      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                        {situation.status} desde {formatDate(situation.registration_date)}
                      </p>
                      {situation.completion_date ? (
                        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                          Concluída em {formatDate(situation.completion_date)}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => startSituationDetail(situation)}
                        className={pessoalSecondaryButtonClassName}
                      >
                        <FileText className="h-4 w-4" />
                        Detalhar
                      </button>
                      {canEdit ? (
                        <button
                          type="button"
                          onClick={() => openDeleteSituationDialog(situation)}
                          disabled={deleteSituationMutation.isPending}
                          className={pessoalSecondaryButtonClassName}
                        >
                          <Trash2 className="h-4 w-4" />
                          Remover
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </TrackingListCard>
          )}
        </div>
      </div>

      <Dialog
        open={Boolean(lddToDelete)}
        onOpenChange={(open) => {
          if (!open) {
            setLddToDelete(null);
          }
        }}
        title="Remover LDD"
        description="Confirmação de remoção de LDD"
        contentClassName="w-[min(92vw,520px)]"
        bodyClassName="space-y-3"
        footer={
          <>
            <button
              type="button"
              onClick={() => setLddToDelete(null)}
              disabled={deleteLddMutation.isPending}
              className={pessoalSecondaryButtonClassName}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirmDeleteLdd}
              disabled={deleteLddMutation.isPending}
              className={pessoalDangerButtonClassName}
            >
              {deleteLddMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Confirmar remoção
            </button>
          </>
        }
      >
        <p className="text-sm text-gray-700 dark:text-slate-300">
          Esta ação remove o LDD selecionado do cliente. O registro precisará ser cadastrado
          novamente se ainda for necessário.
        </p>
        {lddToDelete ? (
          <p className="rounded-lg bg-gray-50 px-3 py-2 text-sm font-medium text-gray-800 dark:bg-gray-900/30 dark:text-gray-200">
            {lddToDelete.type} - {formatDate(lddToDelete.due_date)}
          </p>
        ) : null}
      </Dialog>

      <Dialog
        open={Boolean(situationToDelete)}
        onOpenChange={(open) => {
          if (!open && !deleteSituationMutation.isPending) {
            setSituationToDelete(null);
          }
        }}
        title="Remover situação"
        description="Confirmação de remoção de situação"
        contentClassName="w-[min(92vw,520px)]"
        bodyClassName="space-y-3"
        footer={
          <>
            <button
              type="button"
              onClick={() => setSituationToDelete(null)}
              disabled={deleteSituationMutation.isPending}
              className={pessoalSecondaryButtonClassName}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirmDeleteSituation}
              disabled={deleteSituationMutation.isPending}
              className={pessoalDangerButtonClassName}
            >
              {deleteSituationMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Confirmar remoção
            </button>
          </>
        }
      >
        <p className="text-sm text-gray-700 dark:text-slate-300">
          Não será possível recuperar a situação, mesmo quando ela já estiver finalizada.
        </p>
        {situationToDelete ? (
          <p className="rounded-lg bg-gray-50 px-3 py-2 text-sm font-medium text-gray-800 dark:bg-gray-900/30 dark:text-gray-200">
            {situationToDelete.title}
          </p>
        ) : null}
        {formError ? (
          <p role="alert" className="text-sm text-red-600 dark:text-red-300">
            {formError}
          </p>
        ) : null}
      </Dialog>

      {isLddFormOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/60 p-4 backdrop-blur-sm"
          onClick={() => setIsLddFormOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="pessoal-ldd-form-title"
            onClick={(event) => event.stopPropagation()}
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-gray-200 bg-white p-5 shadow-2xl dark:border-gray-700 dark:bg-gray-800"
          >
            <form onSubmit={handleLddSubmit} className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3
                    id="pessoal-ldd-form-title"
                    className="text-base font-semibold text-gray-900 dark:text-white"
                  >
                    {selectedLdd ? "Editar LDD" : "Criar LDD"}
                  </h3>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                    Campos seguem o contrato do pessoal-service.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsLddFormOpen(false)}
                  disabled={isLddSubmitting}
                  className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 disabled:opacity-60 dark:text-gray-400 dark:hover:bg-gray-700"
                  aria-label="Fechar LDD"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {lddFields.map((field) => {
                  const fieldValue = lddFormValues[field.name];
                  const fieldOptions = "options" in field ? field.options : null;
                  const isMoney = "money" in field && field.money;
                  const helpText = "help" in field ? field.help : undefined;
                  const customOption =
                    fieldOptions &&
                    fieldValue &&
                    !fieldOptions.some((option) => option === fieldValue)
                      ? fieldValue
                      : null;

                  return (
                    <label
                      key={field.name}
                      className="flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-300"
                    >
                      <span className="inline-flex items-center gap-1">
                        <span>{field.label}</span>
                        {helpText ? <FieldHelp label={field.label} description={helpText} /> : null}
                      </span>
                      {fieldOptions ? (
                        <div className="relative">
                          <select
                            value={fieldValue}
                            onChange={(event) =>
                              setLddFormValues((current) => ({
                                ...current,
                                [field.name]: event.target.value,
                              }))
                            }
                            disabled={!canEdit || isLddSubmitting}
                            className={`${pessoalTextFieldClassName} appearance-none pr-12`}
                          >
                            <option value="">Selecione</option>
                            {fieldOptions.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                            {customOption ? (
                              <option value={customOption}>{customOption}</option>
                            ) : null}
                          </select>
                          <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                        </div>
                      ) : (
                        <input
                          type={isMoney ? "text" : "type" in field ? field.type : "text"}
                          inputMode={isMoney ? "decimal" : undefined}
                          step={field.name === "balance_amount" ? "0.01" : undefined}
                          min={field.name === "balance_amount" ? 0 : undefined}
                          value={fieldValue}
                          onChange={(event) =>
                            setLddFormValues((current) => ({
                              ...current,
                              [field.name]: isMoney
                                ? formatBrlInput(event.target.value)
                                : event.target.value,
                            }))
                          }
                          disabled={!canEdit || isLddSubmitting}
                          className={pessoalTextFieldClassName}
                        />
                      )}
                    </label>
                  );
                })}
              </div>

              {formError ? (
                <p role="alert" className="text-sm text-red-600 dark:text-red-300">
                  {formError}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={isLddSubmitting}
                className={`${pessoalPrimaryButtonClassName} w-full`}
              >
                {isLddSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Salvar LDD
              </button>
            </form>
          </div>
        </div>
      ) : null}

      {isSituationFormOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/60 p-4 backdrop-blur-sm"
          onClick={() => setIsSituationFormOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="pessoal-situation-form-title"
            onClick={(event) => event.stopPropagation()}
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-gray-800"
          >
            <form onSubmit={handleSituationSubmit} className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3
                    id="pessoal-situation-form-title"
                    className="text-base font-semibold text-gray-900 dark:text-white"
                  >
                    {selectedSituationId ? "Editar situação" : "Criar situação"}
                  </h3>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                    O detalhe carrega pelo endpoint individual antes da edição.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsSituationFormOpen(false)}
                  disabled={isSituationSubmitting}
                  className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 disabled:opacity-60 dark:text-gray-400 dark:hover:bg-gray-700"
                  aria-label="Fechar situação"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {situationDetailQuery.isFetching ? (
                <StateMessage icon={Loader2} title="Carregando detalhe" tone="loading">
                  Buscando situação selecionada.
                </StateMessage>
              ) : null}

              <label className="flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-300">
                Título
                <input
                  type="text"
                  value={situationFormValues.title}
                  onChange={(event) =>
                    setSituationFormValues((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                  disabled={!canEdit || isSituationSubmitting}
                  className={pessoalTextFieldClassName}
                />
              </label>
              <label className="flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-300">
                Descrição
                <textarea
                  value={situationFormValues.description}
                  onChange={(event) =>
                    setSituationFormValues((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  disabled={!canEdit || isSituationSubmitting}
                  className={`${pessoalTextFieldClassName} min-h-28 resize-y`}
                />
              </label>
              {selectedSituation ? (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-900/30 dark:text-gray-300">
                  <p>Registrada em {formatDate(selectedSituation.registration_date)}</p>
                  <p>Concluída em {formatDate(selectedSituation.completion_date)}</p>
                </div>
              ) : null}

              {selectedSituationId && selectedSituation ? (
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/20 dark:text-blue-100">
                  {selectedSituation.status === "Em andamento" ? (
                    <>
                      <p className="font-medium">Esta situação está em andamento.</p>
                      <p className="mt-1">Finalizar registra a data de conclusão.</p>
                      {canEdit ? (
                        <button
                          type="button"
                          onClick={() => handleSituationStatusChange("Finalizado")}
                          disabled={isSituationSubmitting}
                          className={`${pessoalPrimaryButtonClassName} mt-3`}
                        >
                          {isSituationSubmitting ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Save className="h-4 w-4" />
                          )}
                          {isSituationSubmitting ? "Concluindo situação..." : "Concluir situação"}
                        </button>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <p className="font-medium">Esta situação está finalizada.</p>
                      <p className="mt-1">Reabrir limpa a data de conclusão.</p>
                      {canEdit ? (
                        <button
                          type="button"
                          onClick={() => handleSituationStatusChange("Em andamento")}
                          disabled={isSituationSubmitting}
                          className={`${pessoalSecondaryButtonClassName} mt-3`}
                        >
                          {isSituationSubmitting ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4" />
                          )}
                          {isSituationSubmitting ? "Reabrindo situação..." : "Reabrir situação"}
                        </button>
                      ) : null}
                    </>
                  )}
                </div>
              ) : null}

              {formError ? (
                <p role="alert" className="text-sm text-red-600 dark:text-red-300">
                  {formError}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={isSituationSubmitting}
                className={`${pessoalPrimaryButtonClassName} w-full`}
              >
                {isSituationSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Salvar situação
              </button>
            </form>
          </div>
        </div>
      ) : null}

      {formError ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-300">
          {formError}
        </p>
      ) : null}

      {successMessage ? (
        <p className="text-sm text-emerald-700 dark:text-emerald-300">{successMessage}</p>
      ) : null}
    </section>
  );
}

function TrackingListCard({
  actions,
  children,
  empty,
  emptyMessage,
  error,
  icon,
  loading,
  title,
}: {
  actions?: ReactNode;
  children: ReactNode;
  empty: boolean;
  emptyMessage: string;
  error: Error | null;
  icon: LucideIcon;
  loading: boolean;
  title: string;
}) {
  const Icon = icon;

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Icon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h3>
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>

      <div className="space-y-3">
        {loading ? (
          <StateMessage icon={Loader2} title="Carregando" tone="loading">
            Buscando registros do cliente.
          </StateMessage>
        ) : null}

        {error ? (
          <StateMessage icon={AlertCircle} title="Não foi possível carregar" tone="danger">
            {getPessoalErrorMessage(error, "Falha ao carregar acompanhamentos.")}
          </StateMessage>
        ) : null}

        {!loading && !error && empty ? (
          <StateMessage icon={Icon} title="Nenhum registro">
            {emptyMessage}
          </StateMessage>
        ) : null}

        {!loading && !error && !empty ? children : null}
      </div>
    </div>
  );
}

function StateMessage({
  children,
  icon: Icon,
  title,
  tone = "neutral",
}: {
  children: string;
  icon: LucideIcon;
  title: string;
  tone?: "danger" | "loading" | "neutral";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-4 text-sm",
        tone === "danger" &&
          "border-red-200 bg-red-50 text-red-800 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-100",
        tone === "loading" &&
          "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900/50 dark:bg-blue-950/20 dark:text-blue-100",
        tone === "neutral" &&
          "border-dashed border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-700 dark:bg-gray-900/30 dark:text-gray-300",
      )}
    >
      <div className="flex gap-3">
        <Icon
          className={cn(
            "mt-0.5 h-4 w-4 shrink-0",
            tone === "loading" && "animate-spin",
          )}
        />
        <div>
          <p className="font-semibold">{title}</p>
          <p className="mt-1">{children}</p>
        </div>
      </div>
    </div>
  );
}
