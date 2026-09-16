import { useState, type FormEvent } from "react";
import { Archive, CircleAlert, Loader2, Pencil, Plus, Save, Trash2, X } from "lucide-react";

import { useModuleAccess } from "@modules/auth";
import { formatBrlInput, parseBrlInput } from "@shared/utils/inputFormatting";

import {
  useCommercialProspecting,
  useCommercialProspectingClients,
  useArchiveCommercialProspecting,
  useCreateCommercialProspecting,
  useUpdateCommercialProspecting,
} from "../hooks/useCommercialProspecting";
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
  type CommercialProposalConfig,
} from "../types";

function formatContractValue(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function formatContractValueForInput(value: number): string {
  return formatBrlInput(String(Math.round(value * 100)));
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "response" in error) {
    const response = (error as { response?: { data?: { error?: string } } }).response;
    if (response?.data?.error) return response.data.error;
  }
  return fallback;
}

type Draft = { name: string; contract_value: string };
type ProspectingDraft = {
  client_id: string;
  status: (typeof COMMERCIAL_PROSPECTING_STATUSES)[number];
  status_date: string;
  description: string;
};

const emptyDraft: Draft = { name: "", contract_value: "" };
const emptyProspectingDraft: ProspectingDraft = {
  client_id: "",
  status: COMMERCIAL_PROSPECTING_STATUSES[0],
  status_date: "",
  description: "",
};

export function CommercialCatalog() {
  const { access, isLoading: accessLoading } = useModuleAccess("comercial");
  const configsQuery = useCommercialProposalConfigs();
  const prospectingQuery = useCommercialProspecting();
  const prospectingClientsQuery = useCommercialProspectingClients();
  const createMutation = useCreateCommercialProposalConfig();
  const deleteMutation = useDeleteCommercialProposalConfig();
  const updateMutation = useUpdateCommercialProposalConfig();
  const createProspectingMutation = useCreateCommercialProspecting();
  const updateProspectingMutation = useUpdateCommercialProspecting();
  const archiveProspectingMutation = useArchiveCommercialProspecting();
  const taskBillingsQuery = useCommercialTaskBilling();
  const updateTaskBillingMutation = useUpdateCommercialTaskBilling();
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [prospectingDraft, setProspectingDraft] = useState<ProspectingDraft>(emptyProspectingDraft);
  const [isCreatingProspecting, setIsCreatingProspecting] = useState(false);
  const [prospectingEditingId, setProspectingEditingId] = useState<string | null>(null);
  const [prospectingFormError, setProspectingFormError] = useState("");
  const [prospectingActionError, setProspectingActionError] = useState("");
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

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const isSavingProspecting =
    createProspectingMutation.isPending || updateProspectingMutation.isPending;
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
      cancelTaskBillingEdit();
    } catch (error) {
      setTaskBillingFormError(getErrorMessage(error, "Não foi possível salvar a cobrança."));
    }
  }

  function startCreate() {
    setIsCreating(true);
    setEditingId(null);
    setDraft(emptyDraft);
    setFormError("");
  }

  function startEdit(config: CommercialProposalConfig) {
    setIsCreating(false);
    setEditingId(config.id);
    setDraft({ name: config.name, contract_value: formatContractValueForInput(config.contract_value) });
    setFormError("");
  }

  function cancelForm() {
    setIsCreating(false);
    setEditingId(null);
    setDraft(emptyDraft);
    setFormError("");
  }

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = draft.name.trim();
    const contractValue = parseBrlInput(draft.contract_value);

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

  async function deleteConfig(config: CommercialProposalConfig) {
    if (!window.confirm(`Excluir a configuração "${config.name}"?`)) return;

    setDeleteError("");
    try {
      await deleteMutation.mutateAsync(config.id);
      if (editingId === config.id) cancelForm();
    } catch (error) {
      setDeleteError(getErrorMessage(error, "Não foi possível excluir a configuração."));
    }
  }

  function startProspectingCreate() {
    setIsCreatingProspecting(true);
    setProspectingEditingId(null);
    setProspectingDraft(emptyProspectingDraft);
    setProspectingFormError("");
  }

  function startProspectingEdit(item: CommercialProspecting) {
    setIsCreatingProspecting(false);
    setProspectingEditingId(item.id);
    setProspectingDraft({
      client_id: item.client_id,
      status: item.status,
      status_date: item.status_date ? item.status_date.slice(0, 10) : "",
      description: item.description ?? "",
    });
    setProspectingFormError("");
  }

  function cancelProspectingForm() {
    setIsCreatingProspecting(false);
    setProspectingEditingId(null);
    setProspectingDraft(emptyProspectingDraft);
    setProspectingFormError("");
  }

  async function submitProspectingForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!prospectingEditingId && !prospectingDraft.client_id) {
      setProspectingFormError("Selecione um cliente.");
      return;
    }
    setProspectingFormError("");
    const payload = {
      status: prospectingDraft.status,
      status_date: prospectingDraft.status_date
        ? new Date(`${prospectingDraft.status_date}T12:00:00`).toISOString()
        : null,
      description: prospectingDraft.description.trim() || null,
    };
    try {
      if (prospectingEditingId) {
        await updateProspectingMutation.mutateAsync({ id: prospectingEditingId, payload });
      } else {
        await createProspectingMutation.mutateAsync({
          client_id: prospectingDraft.client_id,
          ...payload,
        });
      }
      cancelProspectingForm();
    } catch (error) {
      setProspectingFormError(getErrorMessage(error, "Não foi possível salvar a prospecção."));
    }
  }

  async function archiveProspecting(item: CommercialProspecting) {
    const clientName = item.client.fantasy_name || item.client.company_name || item.client.name;
    if (!window.confirm(`Arquivar a prospecção de "${clientName}"? O histórico será preservado.`)) {
      return;
    }

    setProspectingActionError("");
    try {
      await archiveProspectingMutation.mutateAsync(item.id);
      if (prospectingEditingId === item.id) cancelProspectingForm();
    } catch (error) {
      setProspectingActionError(
        getErrorMessage(error, "Não foi possível arquivar a prospecção."),
      );
    }
  }

  if (accessLoading) {
    return <div className="mx-auto max-w-[1200px] p-6 text-sm text-slate-500">Carregando acesso...</div>;
  }

  if (!access.canView) {
    return (
      <section className="mx-auto max-w-[1200px] rounded-xl border border-amber-200 bg-amber-50 p-6 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-100">
        Você não tem acesso ao módulo Comercial. Solicite a liberação ao administrador da organização.
      </section>
    );
  }

  return (
    <>
      <div className="commercial-catalog mx-auto max-w-[1200px] space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-blue-600 dark:text-blue-300">Comercial</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Catálogo de propostas</h1>
          <p className="mt-2 max-w-[65ch] text-base leading-7 text-slate-700 dark:text-slate-300">
            Defina o nome e o valor base usados nas propostas comerciais da sua organização.
          </p>
        </div>
      {canEdit && !editingId && !isCreating ? (
          <button type="button" onClick={startCreate} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-950">
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

      {isCreating || editingId !== null ? (
        <form onSubmit={submitForm} className="rounded-xl border border-blue-200 bg-blue-50/60 p-5 dark:border-blue-900/50 dark:bg-blue-950/20" aria-label={editingId ? "Editar configuração" : "Nova configuração"}>
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px_auto] md:items-end">
            <label className="text-sm font-medium text-slate-800 dark:text-slate-100">Nome
              <input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-slate-600 dark:bg-slate-900 dark:text-white" autoFocus />
            </label>
            <label className="text-sm font-medium text-slate-800 dark:text-slate-100">Valor base do contrato
              <input type="text" inputMode="decimal" value={draft.contract_value} onKeyDown={(event) => {
                if ((event.key === "Backspace" || event.key === "Delete") && parseBrlInput(event.currentTarget.value) === 0) {
                  event.preventDefault();
                  setDraft((current) => ({ ...current, contract_value: "" }));
                }
              }} onChange={(event) => setDraft((current) => ({ ...current, contract_value: formatBrlInput(event.target.value) }))} className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base tabular-nums text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-slate-600 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500" placeholder="R$ 0,00" />
            </label>
            <div className="flex gap-2 md:justify-end">
              <button type="submit" disabled={isSaving} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 md:flex-none">
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
                Salvar
              </button>
              <button type="button" onClick={cancelForm} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">
                <X className="h-4 w-4" aria-hidden="true" /> Cancelar
              </button>
            </div>
          </div>
          {formError ? <p className="mt-3 flex items-center gap-2 text-sm text-red-700 dark:text-red-300" role="alert"><CircleAlert className="h-4 w-4" aria-hidden="true" />{formError}</p> : null}
        </form>
      ) : null}

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
          {deleteError ? <p className="flex items-center gap-2 border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300" role="alert"><CircleAlert className="h-4 w-4" aria-hidden="true" />{deleteError}</p> : null}
          <div className="divide-y divide-slate-200 dark:divide-slate-700">
            {configsQuery.data.map((config) => <div key={config.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold text-slate-900 dark:text-white">{config.name}</p><p className="mt-1 text-sm tabular-nums text-slate-500 dark:text-slate-400">Valor base do contrato: {formatContractValue(config.contract_value)}</p></div>{canEdit ? <div className="flex flex-wrap gap-2"><button type="button" onClick={() => startEdit(config)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"><Pencil className="h-4 w-4" aria-hidden="true" />Editar</button><button type="button" aria-label={`Excluir configuração ${config.name}`} onClick={() => void deleteConfig(config)} disabled={deleteMutation.isPending} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-red-200 px-3 text-sm font-semibold text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/30"><Trash2 className="h-4 w-4" aria-hidden="true" />Excluir configuração</button></div> : null}</div>)}
          </div>
        </section>
      ) : (
        <section className="rounded-xl border border-dashed border-slate-300 px-6 py-12 text-center dark:border-slate-700"><h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Nenhuma configuração cadastrada</h2><p className="mx-auto mt-2 max-w-[48ch] text-sm leading-6 text-slate-700 dark:text-slate-300">Crie a primeira configuração para disponibilizar um valor base nas propostas comerciais.</p>{canEdit ? <button type="button" onClick={startCreate} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"><Plus className="h-4 w-4" aria-hidden="true" />Criar configuração</button> : null}</section>
      )}

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900" aria-labelledby="commercial-prospecting-title">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-700">
          <div>
            <h2 id="commercial-prospecting-title" className="text-lg font-semibold text-slate-900 dark:text-slate-100">Prospecção</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Acompanhe os status legados por cliente, com histórico auditável.</p>
          </div>
          {canEdit && prospectingEditingId === null ? <button type="button" onClick={startProspectingCreate} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"><Plus className="h-4 w-4" aria-hidden="true" />Nova prospecção</button> : null}
        </div>

        {isCreatingProspecting || prospectingEditingId !== null || (!prospectingQuery.data?.length && canEdit) ? (
          <form onSubmit={submitProspectingForm} className="border-b border-slate-200 bg-blue-50/60 p-5 dark:border-slate-700 dark:bg-blue-950/20" aria-label={prospectingEditingId ? "Editar prospecção" : "Nova prospecção"}>
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px_180px]">
              <label className="text-sm font-medium text-slate-800 dark:text-slate-100">Cliente
                <select disabled={prospectingEditingId !== null} value={prospectingDraft.client_id} onChange={(event) => setProspectingDraft((current) => ({ ...current, client_id: event.target.value }))} className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-white">
                  <option value="">Selecione um cliente</option>
                  {(prospectingClientsQuery.data ?? []).map((client) => <option key={client.id} value={client.id}>{client.name}{client.fantasy_name ? ` — ${client.fantasy_name}` : ""}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium text-slate-800 dark:text-slate-100">Status
                <select value={prospectingDraft.status} onChange={(event) => setProspectingDraft((current) => ({ ...current, status: event.target.value as ProspectingDraft["status"] }))} className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-slate-600 dark:bg-slate-900 dark:text-white">{COMMERCIAL_PROSPECTING_STATUSES.map((status) => <option key={status}>{status}</option>)}</select>
              </label>
              <label className="text-sm font-medium text-slate-800 dark:text-slate-100">Data do status
                <input type="date" value={prospectingDraft.status_date} onChange={(event) => setProspectingDraft((current) => ({ ...current, status_date: event.target.value }))} className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-slate-600 dark:bg-slate-900 dark:text-white" />
              </label>
            </div>
            <label className="mt-4 block text-sm font-medium text-slate-800 dark:text-slate-100">Descrição
              <textarea value={prospectingDraft.description} onChange={(event) => setProspectingDraft((current) => ({ ...current, description: event.target.value }))} rows={3} maxLength={5000} className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-slate-600 dark:bg-slate-900 dark:text-white" />
            </label>
            <div className="mt-4 flex flex-wrap justify-end gap-2"><button type="submit" disabled={isSavingProspecting} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"><Save className="h-4 w-4" aria-hidden="true" />Salvar</button><button type="button" onClick={cancelProspectingForm} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-white dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"><X className="h-4 w-4" aria-hidden="true" />Cancelar</button></div>
            {prospectingFormError ? <p className="mt-3 flex items-center gap-2 text-sm text-red-700 dark:text-red-300" role="alert"><CircleAlert className="h-4 w-4" aria-hidden="true" />{prospectingFormError}</p> : null}
          </form>
        ) : null}

        {prospectingActionError ? <p className="border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300" role="alert">{prospectingActionError}</p> : null}

        {prospectingQuery.isLoading ? <div className="p-5 text-sm text-slate-500">Carregando prospecções...</div> : prospectingQuery.isError ? <div className="p-5 text-sm text-red-700 dark:text-red-300" role="alert">Não foi possível carregar as prospecções.</div> : prospectingQuery.data?.length ? <div className="divide-y divide-slate-200 dark:divide-slate-700">{prospectingQuery.data.map((item) => <div key={item.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold text-slate-900 dark:text-white">{item.client.fantasy_name || item.client.company_name || item.client.name}</p><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{item.status}{item.description ? ` — ${item.description}` : ""}</p></div>{canEdit ? <div className="flex flex-wrap gap-2"><button type="button" onClick={() => startProspectingEdit(item)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"><Pencil className="h-4 w-4" aria-hidden="true" />Editar</button><button type="button" aria-label={`Arquivar prospecção ${item.client.fantasy_name || item.client.company_name || item.client.name}`} onClick={() => void archiveProspecting(item)} disabled={archiveProspectingMutation.isPending} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-amber-200 px-3 text-sm font-semibold text-amber-800 hover:bg-amber-50 focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-amber-900/60 dark:text-amber-300 dark:hover:bg-amber-950/30"><Archive className="h-4 w-4" aria-hidden="true" />Arquivar prospecção</button></div> : null}</div>)}</div> : <div className="p-8 text-center text-sm text-slate-700 dark:text-slate-300">Nenhuma prospecção cadastrada.</div>}
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
            Registre a decisão comercial, o pagamento e a descrição. A Integração receberá os efeitos por evento.
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
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Status atual: {item.task_status}</p>
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
                      Pagamento
                      <input
                        value={taskBillingDraft.payment}
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
                      {item.hiring_status ?? "Sem decisão comercial"} · {item.payment ?? "Pagamento não informado"}
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
    </>
  );
}
