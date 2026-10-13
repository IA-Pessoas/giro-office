import { useRef, useState, type FormEvent, type MouseEvent } from "react";
import { Archive, Briefcase, CircleAlert, Loader2, Pencil, Plus, Save, Trash2, X } from "lucide-react";

import { toast } from "@shared/services/toast";

import { useModuleAccess } from "@modules/auth";
import { ClientPickerModal, getClientDisplayName, type ClientPickerOption } from "@modules/clients";
import { ConfirmationDialog, Dialog } from "@shared/components";
import { formatBrlAmount, formatBrlInput, parseBrlInput } from "@shared/utils/inputFormatting";

import {
  useCommercialProspecting,
  useCommercialProspectingClients,
  useArchiveCommercialProspecting,
  useCreateCommercialProspecting,
  useUpdateCommercialProspecting,
  useUploadCommercialProspectingAttachment,
} from "../hooks/useCommercialProspecting";
import { commercialService } from "../services/commercialService";
import {
  useCommercialTaskBilling,
  useUpdateCommercialTaskBilling,
} from "../hooks/useCommercialTaskBilling";
import {
  useCommercialProposalConfigs,
  useCreateCommercialProposalConfig,
  useDeleteCommercialProposalConfig,
  useUpdateCommercialProposalConfig,
} from "../hooks/useCommercialProposalConfigs";
import {
  COMMERCIAL_PROSPECTING_STATUSES,
  COMMERCIAL_TASK_HIRING_STATUSES,
  type CommercialTaskHiringStatus,
  type CommercialTaskBilling,
  type CommercialProspecting,
  type CommercialProspectingStatus,
  type CommercialProspectingHistoryEntry,
  type CommercialProposalConfig,
} from "../types";

function formatContractValue(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function formatContractValueForInput(value: number): string {
  return formatBrlAmount(value);
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "response" in error) {
    const response = (error as { response?: { data?: { error?: string } } }).response;
    if (response?.data?.error) return response.data.error;
  }
  return fallback;
}

type Draft = { name: string; contract_value: string };
type PendingConfirmation =
  | { type: "delete-config"; config: CommercialProposalConfig }
  | { type: "archive-prospecting"; item: CommercialProspecting };
type ProspectingDraft = {
  client: ClientPickerOption | null;
  status: CommercialProspectingStatus | "Fechado SE";
  status_date: string;
  solution: "CASTELO" | "KALANGO" | "META" | "NIT" | "";
  reference_month: string;
  service: string;
  description: string;
  participants: string;
  meeting_mode: string;
  branch: string;
  pause_reason: string;
};

const emptyDraft: Draft = { name: "", contract_value: "" };
const emptyProspectingDraft: ProspectingDraft = {
  client: null,
  status: COMMERCIAL_PROSPECTING_STATUSES[0],
  status_date: "",
  solution: "",
  reference_month: "",
  service: "",
  description: "",
  participants: "",
  meeting_mode: "",
  branch: "",
  pause_reason: "",
};

export function CommercialCatalog() {
  const { access, isLoading: accessLoading } = useModuleAccess("comercial");
  const configsQuery = useCommercialProposalConfigs();
  const [prospectingStatusFilter, setProspectingStatusFilter] = useState<CommercialProspectingStatus | "Todas">("Todas");
  const [prospectingSearch, setProspectingSearch] = useState("");
  const [prospectingPage, setProspectingPage] = useState(1);
  const [prospectingView, setProspectingView] = useState<"lista" | "kanban">("lista");
  const prospectingFilters = {
    page: prospectingPage,
    page_size: 20,
    ...(prospectingStatusFilter === "Todas" ? {} : { status: prospectingStatusFilter }),
    ...(prospectingSearch.trim() ? { search: prospectingSearch.trim() } : {}),
  };
  const prospectingQuery = useCommercialProspecting(prospectingFilters);
  // Clientes sem nenhuma prospecção (ativa ou arquivada): o backend recusa os demais.
  const eligibleClientsQuery = useCommercialProspectingClients();
  const createMutation = useCreateCommercialProposalConfig();
  const deleteMutation = useDeleteCommercialProposalConfig();
  const updateMutation = useUpdateCommercialProposalConfig();
  const createProspectingMutation = useCreateCommercialProspecting();
  const updateProspectingMutation = useUpdateCommercialProspecting();
  const uploadProspectingAttachmentMutation = useUploadCommercialProspectingAttachment();
  const archiveProspectingMutation = useArchiveCommercialProspecting();
  const taskBillingsQuery = useCommercialTaskBilling();
  const updateTaskBillingMutation = useUpdateCommercialTaskBilling();
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState("");
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);
  const [isConfirmationOpen, setIsConfirmationOpen] = useState(false);
  const [confirmationError, setConfirmationError] = useState<string | null>(null);
  const [prospectingPickError, setProspectingPickError] = useState("");
  const [prospectingDraft, setProspectingDraft] = useState<ProspectingDraft>(emptyProspectingDraft);
  const [isCreatingProspecting, setIsCreatingProspecting] = useState(false);
  const [prospectingEditingId, setProspectingEditingId] = useState<string | null>(null);
  const [prospectingFormError, setProspectingFormError] = useState("");
  const [prospectingHistoryId, setProspectingHistoryId] = useState<string | null>(null);
  const [prospectingHistory, setProspectingHistory] = useState<CommercialProspectingHistoryEntry[]>([]);
  const [prospectingHistoryError, setProspectingHistoryError] = useState("");
  const [prospectingFile, setProspectingFile] = useState<File | null>(null);
  const [taskBillingEditingId, setTaskBillingEditingId] = useState<string | null>(null);
  const [taskBillingDraft, setTaskBillingDraft] = useState<{
    hiring_status: CommercialTaskHiringStatus;
    payment: string;
    billing_description: string;
  }>({
    hiring_status: COMMERCIAL_TASK_HIRING_STATUSES[0],
    payment: "",
    billing_description: "",
  });
  const [taskBillingFormError, setTaskBillingFormError] = useState("");
  const proposalConfigCreateTriggerRef = useRef<HTMLButtonElement>(null);
  const proposalConfigDialogTriggerRef = useRef<HTMLButtonElement>(null);
  const prospectingCreateTriggerRef = useRef<HTMLDivElement>(null);
  const originalContractValueRef = useRef<number | null>(null);
  const contractValueEditedRef = useRef(false);

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const isSavingProspecting =
    createProspectingMutation.isPending ||
    updateProspectingMutation.isPending ||
    uploadProspectingAttachmentMutation.isPending;
  const canEdit = access.canEdit;

  function startTaskBillingEdit(item: CommercialTaskBilling) {
    setTaskBillingEditingId(item.task_id);
    setTaskBillingDraft({
      hiring_status: item.hiring_status ?? COMMERCIAL_TASK_HIRING_STATUSES[0],
      payment: item.payment ?? "",
      billing_description: item.billing_description ?? "",
    });
    setTaskBillingFormError("");
  }

  function cancelTaskBillingEdit() {
    setTaskBillingEditingId(null);
    setTaskBillingFormError("");
  }

  async function submitTaskBillingEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!taskBillingEditingId) return;
    setTaskBillingFormError("");
    try {
      await updateTaskBillingMutation.mutateAsync({
        taskId: taskBillingEditingId,
        payload: {
          hiring_status: taskBillingDraft.hiring_status,
          payment: taskBillingDraft.payment.trim() || null,
          billing_description: taskBillingDraft.billing_description.trim() || null,
        },
      });
      toast.success("Cobrança salva.");
      cancelTaskBillingEdit();
    } catch (error) {
      setTaskBillingFormError(getErrorMessage(error, "Não foi possível salvar a cobrança."));
    }
  }

  function startCreate(event?: MouseEvent<HTMLButtonElement>) {
    proposalConfigDialogTriggerRef.current = event?.currentTarget ?? proposalConfigCreateTriggerRef.current;
    originalContractValueRef.current = null;
    contractValueEditedRef.current = false;
    setIsCreating(true);
    setEditingId(null);
    setDraft(emptyDraft);
    setFormError("");
  }

  function startEdit(config: CommercialProposalConfig) {
    setIsCreating(false);
    setEditingId(config.id);
    originalContractValueRef.current = config.contract_value;
    contractValueEditedRef.current = false;
    setDraft({ name: config.name, contract_value: formatContractValueForInput(config.contract_value) });
    setFormError("");
  }

  function cancelForm() {
    setIsCreating(false);
    setEditingId(null);
    originalContractValueRef.current = null;
    contractValueEditedRef.current = false;
    setDraft(emptyDraft);
    setFormError("");
  }

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = draft.name.trim();
    const parsedContractValue = parseBrlInput(draft.contract_value);
    const contractValue =
      editingId && !contractValueEditedRef.current && originalContractValueRef.current !== null
        ? originalContractValueRef.current
        : parsedContractValue;

    if (!name) {
      setFormError("Informe o nome da configuração.");
      return;
    }
    if (contractValue === null || contractValue < 0) {
      setFormError("Informe um valor base maior ou igual a zero.");
      return;
    }

    setFormError("");
    try {
      if (editingId) {
        await updateMutation.mutateAsync({ id: editingId, payload: { name, contract_value: contractValue } });
      } else {
        await createMutation.mutateAsync({ name, contract_value: contractValue });
      }
      cancelForm();
    } catch (error) {
      setFormError(getErrorMessage(error, "Não foi possível salvar a configuração."));
    }
  }

  function renderProposalConfigForm(mode: "create" | "edit") {
    const isEditing = mode === "edit";

    return (
      <form
        onSubmit={submitForm}
        className="rounded-xl border border-blue-200 bg-blue-50/60 p-5 dark:border-blue-900/50 dark:bg-blue-950/20"
        aria-label={isEditing ? "Editar configuração" : "Nova configuração"}
      >
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px_auto] md:items-end">
          <label className="text-sm font-medium text-slate-800 dark:text-slate-100">Nome
            <input
              value={draft.name}
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
              className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
              autoFocus
            />
          </label>
          <label className="text-sm font-medium text-slate-800 dark:text-slate-100">Valor base do contrato
            <input
              type="text"
              inputMode="decimal"
              value={draft.contract_value}
              onKeyDown={(event) => {
                if (
                  (event.key === "Backspace" || event.key === "Delete") &&
                  parseBrlInput(event.currentTarget.value) === 0
                ) {
                  event.preventDefault();
                  contractValueEditedRef.current = true;
                  setDraft((current) => ({ ...current, contract_value: "" }));
                }
              }}
              onChange={(event) => {
                contractValueEditedRef.current = true;
                setDraft((current) => ({
                  ...current,
                  contract_value: formatBrlInput(event.target.value),
                }));
              }}
              className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base tabular-nums text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-slate-600 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500"
              placeholder="R$ 0,00"
            />
          </label>
          <div className="flex gap-2 md:justify-end">
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 md:flex-none"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
              {isSaving ? "Salvando..." : "Salvar"}
            </button>
            <button
              type="button"
              onClick={cancelForm}
              disabled={isSaving}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <X className="h-4 w-4" aria-hidden="true" /> Cancelar
            </button>
          </div>
        </div>
        {formError ? <p className="mt-3 flex items-center gap-2 text-sm text-red-700 dark:text-red-300" role="alert"><CircleAlert className="h-4 w-4" aria-hidden="true" />{formError}</p> : null}
      </form>
    );
  }

  function requestConfigDelete(config: CommercialProposalConfig) {
    setConfirmationError(null);
    setPendingConfirmation({ type: "delete-config", config });
    setIsConfirmationOpen(true);
  }

  async function confirmPendingAction() {
    if (!pendingConfirmation) return;
    try {
      if (pendingConfirmation.type === "delete-config") {
        await deleteMutation.mutateAsync(pendingConfirmation.config.id);
        if (editingId === pendingConfirmation.config.id) cancelForm();
      } else {
        await archiveProspectingMutation.mutateAsync(pendingConfirmation.item.id);
        if (prospectingEditingId === pendingConfirmation.item.id) cancelProspectingForm();
      }
      setIsConfirmationOpen(false);
    } catch (error) {
      setConfirmationError(
        getErrorMessage(
          error,
          pendingConfirmation.type === "delete-config"
            ? "Não foi possível excluir a configuração."
            : "Não foi possível arquivar a prospecção.",
        ),
      );
      // Relança para o ConfirmationDialog continuar aberto com o erro.
      throw error;
    }
  }

  function startProspectingCreate(client: ClientPickerOption) {
    const isEligible = eligibleClientsQuery.data?.some((eligible) => eligible.id === client.id);
    if (eligibleClientsQuery.data && !isEligible) {
      setProspectingPickError(`${client.name} já tem uma prospecção, ativa ou arquivada.`);
      return;
    }
    setProspectingPickError("");
    setIsCreatingProspecting(true);
    setProspectingEditingId(null);
    setProspectingDraft({ ...emptyProspectingDraft, client });
    setProspectingFormError("");
    setProspectingFile(null);
  }

  function startProspectingEdit(item: CommercialProspecting) {
    setIsCreatingProspecting(false);
    setProspectingEditingId(item.id);
    setProspectingDraft({
      client: { id: item.client_id, name: getClientDisplayName(item.client) },
      status: item.status,
      status_date: item.status_date ? item.status_date.slice(0, 10) : "",
      solution: item.solution ?? "",
      reference_month: item.reference_month ?? "",
      service: item.service ?? "",
      description: item.description ?? "",
      participants: item.participants ?? "",
      meeting_mode: item.meeting_mode ?? "",
      branch: item.branch ?? "",
      pause_reason: item.pause_reason ?? "",
    });
    setProspectingFormError("");
    setProspectingFile(null);
  }

  function cancelProspectingForm() {
    setIsCreatingProspecting(false);
    setProspectingEditingId(null);
    setProspectingDraft(emptyProspectingDraft);
    setProspectingFormError("");
    setProspectingFile(null);
  }

  async function submitProspectingForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!prospectingEditingId && !prospectingDraft.client) {
      setProspectingFormError("Selecione um cliente.");
      return;
    }
    if (!prospectingDraft.status_date || !prospectingDraft.solution || !prospectingDraft.reference_month) {
      setProspectingFormError("Preencha solução, data da situação e mês de referência.");
      return;
    }
    setProspectingFormError("");
    const payload = {
      status: prospectingDraft.status,
      status_date: prospectingDraft.status_date
        ? new Date(`${prospectingDraft.status_date}T12:00:00`).toISOString()
        : "",
      solution: prospectingDraft.solution,
      reference_month: prospectingDraft.reference_month,
      service: prospectingDraft.service.trim() || null,
      description: prospectingDraft.description.trim() || null,
      participants: prospectingDraft.participants.trim() || null,
      meeting_mode: prospectingDraft.meeting_mode.trim() || null,
      branch: prospectingDraft.branch.trim() || null,
      pause_reason: prospectingDraft.pause_reason.trim() || null,
    };
    let savedProspectingId = prospectingEditingId;
    try {
      if (prospectingEditingId) {
        const saved = await updateProspectingMutation.mutateAsync({ id: prospectingEditingId, payload });
        savedProspectingId = saved.id;
      } else {
        const { status, ...createPayload } = payload;
        if (status === "Fechado SE") {
          setProspectingFormError("Fechado SE só pode ser usado ao atualizar uma prospecção.");
          return;
        }
        const saved = await createProspectingMutation.mutateAsync({
          client_id: prospectingDraft.client.id,
          ...createPayload,
          status,
        });
        savedProspectingId = saved.id;
      }
      if (prospectingFile && savedProspectingId) {
        await uploadProspectingAttachmentMutation.mutateAsync({
          id: savedProspectingId,
          file: prospectingFile,
        });
      }
      cancelProspectingForm();
    } catch (error) {
      if (!prospectingEditingId && savedProspectingId) {
        setIsCreatingProspecting(false);
        setProspectingEditingId(savedProspectingId);
      }
      setProspectingFormError(getErrorMessage(error, "Não foi possível salvar a prospecção."));
    }
  }

  async function loadProspectingHistory(id: string) {
    setProspectingHistoryId(id);
    setProspectingHistory([]);
    setProspectingHistoryError("");
    try {
      setProspectingHistory(await commercialService.listProspectingHistory(id));
    } catch (error) {
      setProspectingHistoryError(getErrorMessage(error, "Não foi possível carregar o histórico."));
    }
  }

  async function openProspectingAttachment(id: string) {
    try {
      const attachment = await commercialService.getProspectingAttachment(id);
      window.location.assign(attachment.url);
    } catch (error) {
      setProspectingFormError(getErrorMessage(error, "Não foi possível abrir o anexo."));
    }
  }

  function renderProspectingForm(mode: "create" | "edit") {
    const isEditing = mode === "edit";

    return (
      <form
        onSubmit={submitProspectingForm}
        className="border-b border-slate-200 bg-blue-50/60 p-5 dark:border-slate-700 dark:bg-blue-950/20"
        aria-label={isEditing ? "Editar prospecção" : "Nova prospecção"}
      >
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px_180px]">
          <div className="text-sm font-medium text-slate-800 dark:text-slate-100">
            <span>Cliente</span>
            <p className="mt-2 flex min-h-11 items-center rounded-lg border border-slate-300 bg-slate-50 px-3 text-base text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white">
              {prospectingDraft.client?.name ?? "Nenhum cliente selecionado"}
            </p>
          </div>
          <label className="text-sm font-medium text-slate-800 dark:text-slate-100">Etapa
            <select
              value={prospectingDraft.status}
              onChange={(event) =>
                setProspectingDraft((current) => ({
                  ...current,
                  status: event.target.value as ProspectingDraft["status"],
                }))
              }
              className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
            >
              {COMMERCIAL_PROSPECTING_STATUSES.map((status) => <option key={status}>{status}</option>)}
              {isEditing ? <option>Fechado SE</option> : null}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-800 dark:text-slate-100">Data da etapa
            <input
              type="date"
              required
              value={prospectingDraft.status_date}
              onChange={(event) =>
                setProspectingDraft((current) => ({ ...current, status_date: event.target.value }))
              }
              className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
            />
          </label>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <label className="text-sm font-medium text-slate-800 dark:text-slate-100">Solução *
            <select required value={prospectingDraft.solution} onChange={(event) => setProspectingDraft((current) => ({ ...current, solution: event.target.value as ProspectingDraft["solution"] }))} className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white">
              <option value="">Selecione</option>
              {["CASTELO", "KALANGO", "META", "NIT"].map((solution) => <option key={solution}>{solution}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-800 dark:text-slate-100">Mês de referência *
            <input required type="month" value={prospectingDraft.reference_month} onChange={(event) => setProspectingDraft((current) => ({ ...current, reference_month: event.target.value }))} className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white" />
          </label>
          <label className="text-sm font-medium text-slate-800 dark:text-slate-100">Serviço
            <input value={prospectingDraft.service} onChange={(event) => setProspectingDraft((current) => ({ ...current, service: event.target.value }))} maxLength={1000} className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white" />
          </label>
          <label className="text-sm font-medium text-slate-800 dark:text-slate-100">Participantes
            <input value={prospectingDraft.participants} onChange={(event) => setProspectingDraft((current) => ({ ...current, participants: event.target.value }))} maxLength={1000} className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white" />
          </label>
          <label className="text-sm font-medium text-slate-800 dark:text-slate-100">Modo de reunião
            <input value={prospectingDraft.meeting_mode} onChange={(event) => setProspectingDraft((current) => ({ ...current, meeting_mode: event.target.value }))} maxLength={1000} className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white" />
          </label>
          <label className="text-sm font-medium text-slate-800 dark:text-slate-100">Ramo
            <input value={prospectingDraft.branch} onChange={(event) => setProspectingDraft((current) => ({ ...current, branch: event.target.value }))} maxLength={1000} className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white" />
          </label>
        </div>
        <label className="mt-4 block text-sm font-medium text-slate-800 dark:text-slate-100">Descrição
          <textarea
            value={prospectingDraft.description}
            onChange={(event) =>
              setProspectingDraft((current) => ({ ...current, description: event.target.value }))
            }
            rows={3}
            maxLength={5000}
            className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
          />
        </label>
        {prospectingDraft.status === "Paralisado" ? (
          <label className="mt-4 block text-sm font-medium text-slate-800 dark:text-slate-100">Motivo da paralisação *
            <textarea required value={prospectingDraft.pause_reason} onChange={(event) => setProspectingDraft((current) => ({ ...current, pause_reason: event.target.value }))} maxLength={1000} rows={2} className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white" />
          </label>
        ) : null}
        {prospectingDraft.status === "Paralisado" ? (
          <div className="mt-4 space-y-2 text-sm text-slate-700 dark:text-slate-300">
            <label className="block font-medium">Anexo opcional (PDF, imagem ou texto)
              <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp,text/plain" onChange={(event) => setProspectingFile(event.target.files?.[0] ?? null)} className="mt-2 block w-full text-sm" />
            </label>
            {isEditing && prospectingQuery.data?.items.find((item) => item.id === prospectingEditingId)?.attachment_name ? (
              <button type="button" onClick={() => { if (prospectingEditingId) void openProspectingAttachment(prospectingEditingId); }} className="min-h-10 text-blue-700 underline dark:text-blue-300">Abrir anexo atual: {prospectingQuery.data.items.find((item) => item.id === prospectingEditingId)?.attachment_name}</button>
            ) : null}
          </div>
        ) : null}
        {isEditing ? (
          <div className="mt-4">
            <button type="button" onClick={() => { if (prospectingEditingId) void loadProspectingHistory(prospectingEditingId); }} className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700 dark:border-slate-600 dark:text-slate-200">{prospectingHistoryId === prospectingEditingId ? "Atualizar histórico" : "Ver histórico"}</button>
            {prospectingHistoryId === prospectingEditingId ? (
              <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900" aria-live="polite">
                {prospectingHistoryError ? <p role="alert" className="text-sm text-red-700">{prospectingHistoryError}</p> : prospectingHistory.length ? <ul className="space-y-2">{prospectingHistory.map((entry) => <li key={entry.id} className="text-sm text-slate-700 dark:text-slate-300"><strong>{entry.field}</strong>: {String(entry.old_value ?? "—")} → {String(entry.new_value ?? "—")} · {new Date(entry.created_at).toLocaleString("pt-BR")} · {entry.changed_by_name ?? entry.changed_by}</li>)}</ul> : <p className="text-sm text-slate-500">Nenhuma alteração registrada.</p>}
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button
            type="submit"
            disabled={isSavingProspecting}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSavingProspecting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
            {isSavingProspecting ? "Salvando..." : "Salvar"}
          </button>
          <button
            type="button"
            onClick={cancelProspectingForm}
            disabled={isSavingProspecting}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" aria-hidden="true" />Cancelar
          </button>
        </div>
        {prospectingFormError ? <p className="mt-3 flex items-center gap-2 text-sm text-red-700 dark:text-red-300" role="alert"><CircleAlert className="h-4 w-4" aria-hidden="true" />{prospectingFormError}</p> : null}
      </form>
    );
  }

  function requestProspectingArchive(item: CommercialProspecting) {
    setConfirmationError(null);
    setPendingConfirmation({ type: "archive-prospecting", item });
    setIsConfirmationOpen(true);
  }

  if (accessLoading) {
    return <div className="mx-auto max-w-[1600px] p-6 text-sm text-slate-500">Carregando acesso...</div>;
  }

  if (!access.canView) {
    return (
      <section className="mx-auto max-w-[1600px] rounded-xl border border-amber-200 bg-amber-50 p-6 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-100">
        Você não tem acesso ao módulo Comercial. Solicite a liberação ao administrador da organização.
      </section>
    );
  }

  return (
    <>
      <div className="commercial-catalog mx-auto max-w-[1600px] space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="mb-1 flex items-center gap-3 text-3xl font-bold text-gray-900 dark:text-white">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-600">
              <Briefcase className="h-5 w-5 text-white" aria-hidden="true" />
            </span>
            Catálogo de propostas
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Defina o nome e o valor base usados nas propostas comerciais da sua organização.
          </p>
        </div>
      {canEdit && !editingId ? (
          <button ref={proposalConfigCreateTriggerRef} type="button" onClick={startCreate} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-950">
            <Plus className="h-4 w-4" aria-hidden="true" />
            Nova configuração
          </button>
        ) : null}
      </header>

      {editingId === null && canEdit ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Você pode editar o catálogo da organização.</p>
      ) : !canEdit ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">Acesso somente leitura.</p>
      ) : null}

      {editingId !== null ? renderProposalConfigForm("edit") : null}
      <Dialog
        open={isCreating}
        onOpenChange={(open) => {
          if (!open) cancelForm();
        }}
        title="Nova configuração"
        description="Cadastre o nome e o valor base da configuração comercial."
        preventClose={isSaving}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          proposalConfigDialogTriggerRef.current?.focus();
        }}
        bodyClassName="!px-0 !py-0"
      >
        {renderProposalConfigForm("create")}
      </Dialog>

      {configsQuery.isLoading ? (
        <div className="space-y-3" aria-label="Carregando catálogo">
          {[1, 2, 3].map((item) => <div key={item} className="h-16 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />)}
        </div>
      ) : configsQuery.isError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-200" role="alert">
          Não foi possível carregar o catálogo. Tente novamente.
        </div>
      ) : configsQuery.data?.length ? (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900" aria-labelledby="commercial-catalog-title">
          <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-700"><h2 id="commercial-catalog-title" className="text-lg font-semibold text-slate-900 dark:text-slate-100">Configurações cadastradas</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{configsQuery.data.length} {configsQuery.data.length === 1 ? "item" : "itens"}</p></div>
          <div className="divide-y divide-slate-200 dark:divide-slate-700">
            {configsQuery.data.map((config) => <div key={config.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold text-slate-900 dark:text-white">{config.name}</p><p className="mt-1 text-sm tabular-nums text-slate-500 dark:text-slate-400">Valor base do contrato: {formatContractValue(config.contract_value)}</p></div>{canEdit ? <div className="flex flex-wrap gap-2"><button type="button" onClick={() => startEdit(config)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"><Pencil className="h-4 w-4" aria-hidden="true" />Editar</button><button type="button" aria-label={`Excluir configuração ${config.name}`} onClick={() => requestConfigDelete(config)} disabled={deleteMutation.isPending} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-red-200 px-3 text-sm font-semibold text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/30"><Trash2 className="h-4 w-4" aria-hidden="true" />Excluir configuração</button></div> : null}</div>)}
          </div>
        </section>
      ) : (
        <section className="rounded-xl border border-dashed border-slate-300 px-6 py-12 text-center dark:border-slate-700"><h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Nenhuma configuração cadastrada</h2><p className="mx-auto mt-2 max-w-[48ch] text-sm leading-6 text-slate-700 dark:text-slate-300">Crie a primeira configuração para disponibilizar um valor base nas propostas comerciais.</p>{canEdit ? <button type="button" onClick={startCreate} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"><Plus className="h-4 w-4" aria-hidden="true" />Criar configuração</button> : null}</section>
      )}

      <section className="commercial-prospecting-print overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900" aria-labelledby="commercial-prospecting-title">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-700">
          <div>
            <h2 id="commercial-prospecting-title" className="text-lg font-semibold text-slate-900 dark:text-slate-100">Prospecção</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Acompanhe em que etapa está cada cliente em prospecção.</p>
          </div>
          {canEdit && prospectingEditingId === null ? (
            // O picker é o gatilho: seu overlay fixo não abre dentro do Dialog (translate + overflow).
            <div ref={prospectingCreateTriggerRef}>
              <ClientPickerModal
                triggerLabel="Nova prospecção"
                selectedClient={null}
                onSelectClient={(client) => {
                  if (client) startProspectingCreate(client);
                }}
                filters={{ legacyIntegrationStatusFilter: false }}
              />
            </div>
          ) : null}
        </div>

        {prospectingPickError ? <p className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-300" role="alert"><CircleAlert className="h-4 w-4" aria-hidden="true" />{prospectingPickError}</p> : null}

        {prospectingEditingId !== null ? renderProspectingForm("edit") : null}
        <Dialog
          open={isCreatingProspecting}
          onOpenChange={(open) => {
            if (!open) cancelProspectingForm();
          }}
          title="Nova prospecção"
          description="Cadastre uma nova prospecção comercial."
          preventClose={isSavingProspecting}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            prospectingCreateTriggerRef.current?.querySelector("button")?.focus();
          }}
          bodyClassName="!px-0 !py-0"
        >
          {renderProspectingForm("create")}
        </Dialog>


        <div className="flex flex-wrap items-end gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-700" data-print-hide>
          <label className="text-sm font-medium text-slate-800 dark:text-slate-100">Situação
            <select value={prospectingStatusFilter} onChange={(event) => { setProspectingStatusFilter(event.target.value as CommercialProspectingStatus | "Todas"); setProspectingPage(1); }} className="mt-1 block min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white">
              <option>Todas</option>{COMMERCIAL_PROSPECTING_STATUSES.map((status) => <option key={status}>{status}</option>)}
            </select>
          </label>
          <label className="min-w-56 flex-1 text-sm font-medium text-slate-800 dark:text-slate-100">Buscar
            <input type="search" value={prospectingSearch} onChange={(event) => { setProspectingSearch(event.target.value); setProspectingPage(1); }} placeholder="Cliente, documento, contato ou observação" className="mt-1 block min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white" />
          </label>
          <div className="flex gap-2" role="group" aria-label="Visualização das prospecções">
            <button type="button" aria-pressed={prospectingView === "lista"} onClick={() => setProspectingView("lista")} className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm font-semibold aria-pressed:bg-blue-50 aria-pressed:text-blue-800 dark:border-slate-600 dark:text-slate-200">Lista</button>
            <button type="button" aria-pressed={prospectingView === "kanban"} onClick={() => setProspectingView("kanban")} className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm font-semibold aria-pressed:bg-blue-50 aria-pressed:text-blue-800 dark:border-slate-600 dark:text-slate-200">Kanban</button>
          </div>
          <button type="button" onClick={() => { setProspectingView("lista"); window.setTimeout(() => window.print(), 0); }} className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800" data-print-hide>Imprimir lista</button>
        </div>
        <p className="px-5 py-2 text-sm text-slate-500 dark:text-slate-400" aria-live="polite">{prospectingQuery.data ? `${prospectingQuery.data.total} prospecções encontradas` : ""}</p>
        {prospectingQuery.isLoading ? <div className="p-5 text-sm text-slate-500">Carregando prospecções...</div> : prospectingQuery.isError ? <div className="p-5 text-sm text-red-700 dark:text-red-300" role="alert">Não foi possível carregar as prospecções. Tente novamente.</div> : prospectingQuery.data?.items.length ? (
          <>
            <p className="hidden px-5 pb-3 text-sm print:block">Filtros: situação {prospectingStatusFilter}; busca {prospectingSearch.trim() || "sem busca"}; página {prospectingPage}.</p>
            {prospectingView === "lista" ? <div className="overflow-x-auto" data-prospecting-list>
              <table className="min-w-[1100px] w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-300"><tr>{["Cliente", "Documento", "Sócio", "Contato", "Ramo", "Indicação", "Situação", "Observação", "Ações"].map((label) => <th key={label} className="px-4 py-3 font-semibold">{label}</th>)}</tr></thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">{prospectingQuery.data.items.map((item) => <tr key={item.id} className="align-top"><td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">{getClientDisplayName(item.client)}</td><td className="px-4 py-3">{item.client.cpf_cnpj || "—"}</td><td className="px-4 py-3">{item.client.partners.map((partner) => partner.clientPF.name).join(", ") || "—"}</td><td className="px-4 py-3">{[item.client.number, item.client.email].filter(Boolean).join(" · ") || "—"}</td><td className="px-4 py-3">{item.branch || "—"}</td><td className="px-4 py-3">{item.client.indication || "—"}</td><td className="px-4 py-3">{item.status}</td><td className="max-w-64 px-4 py-3">{item.description || "—"}</td><td className="px-4 py-3" data-print-hide>{canEdit ? <div className="flex gap-2"><button type="button" onClick={() => startProspectingEdit(item)} className="min-h-9 rounded border border-slate-300 px-2 font-semibold dark:border-slate-600">Editar</button><button type="button" onClick={() => requestProspectingArchive(item)} disabled={archiveProspectingMutation.isPending} className="min-h-9 rounded border border-amber-200 px-2 font-semibold text-amber-800 dark:border-amber-900/60 dark:text-amber-300">Arquivar</button></div> : "—"}</td></tr>)}</tbody>
              </table>
            </div> : <div className="grid gap-4 overflow-x-auto p-5 md:grid-cols-3">{COMMERCIAL_PROSPECTING_STATUSES.map((status) => {
              const items = prospectingQuery.data.items.filter((item) => item.status === status);
              return <section key={status} className="min-w-64 rounded-lg border border-slate-200 dark:border-slate-700" aria-label={`${status}: ${items.length} prospecções`}><h3 className="border-b border-slate-200 px-4 py-3 font-semibold text-slate-900 dark:border-slate-700 dark:text-white">{status} <span className="text-sm font-normal text-slate-500">({items.length})</span></h3><div className="space-y-3 p-3">{items.map((item) => <article key={item.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700"><h4 className="font-semibold text-slate-900 dark:text-white">{getClientDisplayName(item.client)}</h4><dl className="mt-2 space-y-1 text-sm text-slate-700 dark:text-slate-300"><div>Documento: {item.client.cpf_cnpj || "—"}</div><div>Sócio: {item.client.partners.map((partner) => partner.clientPF.name).join(", ") || "—"}</div><div>Contato: {[item.client.number, item.client.email].filter(Boolean).join(" · ") || "—"}</div><div>Ramo: {item.branch || "—"}</div><div>Indicação: {item.client.indication || "—"}</div><div>Observação: {item.description || "—"}</div></dl>{canEdit ? <button type="button" onClick={() => startProspectingEdit(item)} className="mt-3 min-h-9 rounded border border-slate-300 px-2 text-sm font-semibold dark:border-slate-600">Editar</button> : null}</article>)}{items.length === 0 ? <p className="text-sm text-slate-500">Nenhuma prospecção nesta situação.</p> : null}</div></section>;
            })}</div>}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-4 dark:border-slate-700" data-print-hide><p className="text-sm text-slate-500">Página {prospectingQuery.data.page} de {Math.max(prospectingQuery.data.total_pages, 1)}</p><div className="flex gap-2"><button type="button" disabled={prospectingPage <= 1} onClick={() => setProspectingPage((page) => page - 1)} className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm disabled:opacity-50 dark:border-slate-600">Anterior</button><button type="button" disabled={prospectingPage >= prospectingQuery.data.total_pages} onClick={() => setProspectingPage((page) => page + 1)} className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm disabled:opacity-50 dark:border-slate-600">Próxima</button></div></div>
          </>
        ) : <div className="p-8 text-center text-sm text-slate-700 dark:text-slate-300">Nenhuma prospecção encontrada para os filtros aplicados.</div>}
      </section>

      <section
        className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
        aria-labelledby="commercial-task-billing-title"
      >
        <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-700">
          <h2 id="commercial-task-billing-title" className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Cobrança de tarefas
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Registre se a tarefa foi contratada, a forma de pagamento e observações da cobrança.
          </p>
        </div>

        {taskBillingsQuery.isLoading ? (
          <div className="space-y-3 p-5" aria-label="Carregando cobranças de tarefas">
            {[1, 2, 3].map((item) => <div key={item} className="h-16 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />)}
          </div>
        ) : taskBillingsQuery.isError ? (
          <div className="p-5 text-sm text-red-700 dark:text-red-300" role="alert">
            Não foi possível carregar as cobranças de tarefas.
          </div>
        ) : taskBillingsQuery.data?.length ? (
          <div className="divide-y divide-slate-200 dark:divide-slate-700">
            {taskBillingsQuery.data.map((item) =>
              taskBillingEditingId === item.task_id ? (
                <form key={item.task_id} onSubmit={submitTaskBillingEdit} className="space-y-4 bg-blue-50/60 p-5 dark:bg-blue-950/20">
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white">{item.task_name}</p>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Situação da tarefa: {item.task_status}</p>
                  </div>
                  <div className="grid gap-4 md:grid-cols-3">
                    <label className="text-sm font-medium text-slate-800 dark:text-slate-100">
                      Situação da contratação
                      <select
                        value={taskBillingDraft.hiring_status}
                        onChange={(event) => setTaskBillingDraft((current) => ({ ...current, hiring_status: event.target.value as typeof current.hiring_status }))}
                        className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                      >
                        {COMMERCIAL_TASK_HIRING_STATUSES.map((status) => <option key={status}>{status}</option>)}
                      </select>
                    </label>
                    <label className="text-sm font-medium text-slate-800 dark:text-slate-100">
                      Forma de pagamento
                      <input
                        value={taskBillingDraft.payment}
                        placeholder="Ex.: À vista, boleto em 3x, cartão de crédito"
                        onChange={(event) => setTaskBillingDraft((current) => ({ ...current, payment: event.target.value }))}
                        className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                        maxLength={255}
                      />
                    </label>
                    <label className="text-sm font-medium text-slate-800 dark:text-slate-100">
                      Descrição
                      <input
                        value={taskBillingDraft.billing_description}
                        onChange={(event) => setTaskBillingDraft((current) => ({ ...current, billing_description: event.target.value }))}
                        className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                        maxLength={5000}
                      />
                    </label>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <button type="submit" disabled={updateTaskBillingMutation.isPending} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">
                      {updateTaskBillingMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
                      Salvar cobrança
                    </button>
                    <button type="button" onClick={cancelTaskBillingEdit} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-white dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">
                      <X className="h-4 w-4" aria-hidden="true" /> Cancelar
                    </button>
                  </div>
                  {taskBillingFormError ? <p className="flex items-center gap-2 text-sm text-red-700 dark:text-red-300" role="alert"><CircleAlert className="h-4 w-4" aria-hidden="true" />{taskBillingFormError}</p> : null}
                </form>
              ) : (
                <div key={item.task_id} className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 dark:text-white">{item.task_name}</p>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{item.task_status} · {item.billing}</p>
                    <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
                      {item.hiring_status ?? "Contratação não definida"} · {item.payment ?? "Pagamento não informado"}
                    </p>
                    {item.billing_description ? <p className="mt-1 line-clamp-2 text-sm text-slate-500 dark:text-slate-400">{item.billing_description}</p> : null}
                  </div>
                  {canEdit ? <button type="button" onClick={() => startTaskBillingEdit(item)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"><Pencil className="h-4 w-4" aria-hidden="true" />Editar cobrança</button> : null}
                </div>
              ),
            )}
          </div>
        ) : (
          <div className="p-8 text-center text-sm text-slate-700 dark:text-slate-300">Nenhuma tarefa disponível para cobrança comercial.</div>
        )}
      </section>
      </div>
      <ConfirmationDialog
        open={isConfirmationOpen}
        onOpenChange={(open) => {
          if (!open) {
            // Mantém pendingConfirmation para o texto não trocar durante a animação de saída.
            setIsConfirmationOpen(false);
            setConfirmationError(null);
          }
        }}
        title={pendingConfirmation?.type === "archive-prospecting" ? "Arquivar prospecção" : "Excluir configuração"}
        description={
          pendingConfirmation?.type === "archive-prospecting"
            ? `Arquivar a prospecção de "${getClientDisplayName(pendingConfirmation.item.client)}"? Ela sai da lista, e o histórico é preservado.`
            : `Excluir a configuração "${pendingConfirmation?.config.name ?? ""}"? Ela deixa de aparecer nas propostas.`
        }
        onConfirm={confirmPendingAction}
        isConfirming={deleteMutation.isPending || archiveProspectingMutation.isPending}
        errorMessage={confirmationError}
        confirmLabel={pendingConfirmation?.type === "archive-prospecting" ? "Arquivar" : "Excluir"}
        cancelLabel="Cancelar"
        variant={pendingConfirmation?.type === "archive-prospecting" ? "neutral" : "destructive"}
      />
    </>
  );
}
