import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  AlertCircle,
  ClipboardList,
  FileText,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Trash2,
} from "lucide-react";

import { cn } from "@shared/ui/newLayout/utils";

import {
  useCreatePessoalLddMutation,
  useCreatePessoalSituationMutation,
  useDeletePessoalLddMutation,
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
import {
  pessoalPrimaryButtonClassName,
  pessoalSecondaryButtonClassName,
  pessoalTextFieldClassName,
} from "./pessoalFormControls";
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
  status: PessoalSituationStatus;
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
  status: "Em andamento",
};

const lddFields = [
  { name: "type", label: "Tipo", type: "text" },
  { name: "period", label: "Periodo", type: "text" },
  { name: "due_date", label: "Vencimento", type: "date" },
  { name: "balance_amount", label: "Saldo", type: "number" },
  { name: "registration_status", label: "Cadastro", type: "text" },
  { name: "status", label: "Status", type: "text" },
] as const;

function optional(value: string): string | null {
  const trimmed = value.trim();

  return trimmed ? trimmed : null;
}

function optionalNumber(value: string): number | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);

  return Number.isFinite(parsed) ? parsed : null;
}

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
    balance_amount: typeof ldd.balance_amount === "number" ? String(ldd.balance_amount) : "",
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
    status: situation.status,
  };
}

function getPessoalErrorMessage(error: unknown, fallback: string): string {
  if (error !== null && typeof error === "object" && "response" in error) {
    const data = (error as { response?: { data?: { error?: unknown; message?: unknown } } })
      .response?.data;
    const message = data?.error ?? data?.message;

    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
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
  const [selectedLdd, setSelectedLdd] = useState<PessoalLdd | null>(null);
  const [lddFormValues, setLddFormValues] = useState<LddFormValues>(emptyLddFormValues);
  const updateLddMutation = useUpdatePessoalLddMutation(
    selectedLdd?.id ?? "",
    selectedClientId,
  );
  const [selectedSituationId, setSelectedSituationId] = useState("");
  const situationDetailQuery = usePessoalSituationDetail(
    selectedSituationId,
    hasClient && selectedSituationId.length > 0,
  );
  const updateSituationMutation = useUpdatePessoalSituationMutation(
    selectedSituationId,
    selectedClientId,
  );
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
    createSituationMutation.isPending || updateSituationMutation.isPending;

  useEffect(() => {
    setSelectedLdd(null);
    setLddFormValues(emptyLddFormValues);
    setSelectedSituationId("");
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
  }

  function startEditLdd(ldd: PessoalLdd) {
    clearFeedback();
    setSelectedLdd(ldd);
    setLddFormValues(buildLddFormValues(ldd));
  }

  function buildLddPayload(): PessoalLddPayload {
    return {
      client_id: selectedClientId,
      type: lddFormValues.type.trim(),
      period: optional(lddFormValues.period),
      due_date: optional(lddFormValues.due_date),
      balance_amount: optionalNumber(lddFormValues.balance_amount),
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

    clearFeedback();

    try {
      if (selectedLdd) {
        const { client_id: _clientId, ...body } = payload;
        const savedLdd = await updateLddMutation.mutateAsync(body);

        setSelectedLdd(savedLdd);
        setLddFormValues(buildLddFormValues(savedLdd));
        setSuccessMessage("LDD atualizado.");
      } else {
        const savedLdd = await createLddMutation.mutateAsync(payload);

        setSelectedLdd(savedLdd);
        setLddFormValues(buildLddFormValues(savedLdd));
        setSuccessMessage("LDD criado.");
      }
    } catch (error) {
      setFormError(getPessoalErrorMessage(error, "Nao foi possivel salvar o LDD."));
    }
  }

  async function handleDeleteLdd(ldd: PessoalLdd) {
    if (!canEdit || !confirm("Remover este LDD?")) {
      return;
    }

    clearFeedback();

    try {
      await deleteLddMutation.mutateAsync(ldd.id);

      if (selectedLdd?.id === ldd.id) {
        startNewLdd();
      }

      setSuccessMessage("LDD removido.");
    } catch (error) {
      setFormError(getPessoalErrorMessage(error, "Nao foi possivel remover o LDD."));
    }
  }

  function startNewSituation() {
    clearFeedback();
    setSelectedSituationId("");
    setSituationFormValues(emptySituationFormValues);
  }

  function startSituationDetail(situation: PessoalSituation) {
    clearFeedback();
    setSelectedSituationId(situation.id);
    setSituationFormValues(buildSituationFormValues(situation));
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
      status: situationFormValues.status,
    };

    if (!payload.title || !payload.description) {
      setFormError("Informe titulo e descricao.");
      return;
    }

    clearFeedback();

    try {
      if (selectedSituationId) {
        await updateSituationMutation.mutateAsync({
          title: payload.title,
          description: payload.description,
          status: payload.status,
        });
        setSuccessMessage("Situacao atualizada.");
      } else {
        const created = await createSituationMutation.mutateAsync(payload);

        setSelectedSituationId(created.id);
        setSuccessMessage("Situacao criada.");
      }
    } catch (error) {
      setFormError(getPessoalErrorMessage(error, "Nao foi possivel salvar a situacao."));
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
              LDD e Situacoes vinculados ao cliente selecionado.
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
                {tab === "ldd" ? "LDD" : "Situacoes"}
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
      </div>

      {activeTrackingTab === "ldd" ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
          <TrackingListCard
            icon={FileText}
            title="LDD"
            loading={lddQuery.isLoading}
            error={lddQuery.isError ? lddQuery.error : null}
            empty={lddRows.length === 0}
            emptyMessage="Nenhum LDD cadastrado para este cliente."
          >
            {lddRows.map((ldd) => (
              <div
                key={ldd.id}
                className={cn(
                  "rounded-lg border border-gray-200 p-4 dark:border-gray-700",
                  selectedLdd?.id === ldd.id && "border-blue-300 bg-blue-50 dark:bg-blue-950/20",
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
                        onClick={() => void handleDeleteLdd(ldd)}
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

          <form
            onSubmit={handleLddSubmit}
            className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                  {selectedLdd ? "Editar LDD" : "Novo LDD"}
                </h3>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  Campos seguem o contrato do pessoal-service.
                </p>
              </div>
              {canEdit ? (
                <button
                  type="button"
                  onClick={startNewLdd}
                  className={pessoalSecondaryButtonClassName}
                >
                  <Plus className="h-4 w-4" />
                  Novo
                </button>
              ) : null}
            </div>

            <div className="space-y-3">
              {lddFields.map((field) => (
                <label
                  key={field.name}
                  className="flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-300"
                >
                  {field.label}
                  <input
                    type={field.type}
                    step={field.name === "balance_amount" ? "0.01" : undefined}
                    value={lddFormValues[field.name]}
                    onChange={(event) =>
                      setLddFormValues((current) => ({
                        ...current,
                        [field.name]: event.target.value,
                      }))
                    }
                    disabled={!canEdit || isLddSubmitting}
                    className={pessoalTextFieldClassName}
                  />
                </label>
              ))}
            </div>

            {canEdit ? (
              <button
                type="submit"
                disabled={isLddSubmitting}
                className={`${pessoalPrimaryButtonClassName} mt-4 w-full`}
              >
                {isLddSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Salvar LDD
              </button>
            ) : null}
          </form>
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
          <TrackingListCard
            icon={ClipboardList}
            title="Situacoes"
            loading={situationsQuery.isLoading}
            error={situationsQuery.isError ? situationsQuery.error : null}
            empty={situationRows.length === 0}
            emptyMessage="Nenhuma situacao cadastrada para este cliente."
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
                  </div>
                  <button
                    type="button"
                    onClick={() => startSituationDetail(situation)}
                    className={pessoalSecondaryButtonClassName}
                  >
                    <FileText className="h-4 w-4" />
                    Detalhar
                  </button>
                </div>
              </div>
            ))}
          </TrackingListCard>

          <form
            onSubmit={handleSituationSubmit}
            className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                  {selectedSituationId ? "Editar situacao" : "Nova situacao"}
                </h3>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  O detalhe carrega pelo endpoint individual antes da edicao.
                </p>
              </div>
              {canEdit ? (
                <button
                  type="button"
                  onClick={startNewSituation}
                  className={pessoalSecondaryButtonClassName}
                >
                  <Plus className="h-4 w-4" />
                  Nova
                </button>
              ) : null}
            </div>

            {situationDetailQuery.isFetching ? (
              <StateMessage icon={Loader2} title="Carregando detalhe" tone="loading">
                Buscando situacao selecionada.
              </StateMessage>
            ) : null}

            <div className="mt-3 space-y-3">
              <label className="flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-300">
                Titulo
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
                Descricao
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
              <label className="flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-300">
                Status
                <select
                  value={situationFormValues.status}
                  onChange={(event) =>
                    setSituationFormValues((current) => ({
                      ...current,
                      status: event.target.value as PessoalSituationStatus,
                    }))
                  }
                  disabled={!canEdit || isSituationSubmitting}
                  className={pessoalTextFieldClassName}
                >
                  <option value="Em andamento">Em andamento</option>
                  <option value="Finalizado">Finalizado</option>
                </select>
              </label>

              {selectedSituation ? (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-900/30 dark:text-gray-300">
                  <p>Registrada em {formatDate(selectedSituation.registration_date)}</p>
                  <p>Concluida em {formatDate(selectedSituation.completion_date)}</p>
                </div>
              ) : null}
            </div>

            {canEdit ? (
              <button
                type="submit"
                disabled={isSituationSubmitting}
                className={`${pessoalPrimaryButtonClassName} mt-4 w-full`}
              >
                {isSituationSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Salvar situacao
              </button>
            ) : null}
          </form>
        </div>
      )}

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
  children,
  empty,
  emptyMessage,
  error,
  icon,
  loading,
  title,
}: {
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
    <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-4 flex items-center gap-2">
        <Icon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h3>
      </div>

      <div className="space-y-3">
        {loading ? (
          <StateMessage icon={Loader2} title="Carregando" tone="loading">
            Buscando registros do cliente.
          </StateMessage>
        ) : null}

        {error ? (
          <StateMessage icon={AlertCircle} title="Nao foi possivel carregar" tone="danger">
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
