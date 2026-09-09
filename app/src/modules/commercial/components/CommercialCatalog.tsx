import { useState, type FormEvent } from "react";
import { CircleAlert, Loader2, Pencil, Plus, Save, X } from "lucide-react";

import { useModuleAccess } from "@modules/auth";

import {
  useCommercialProposalConfigs,
  useCreateCommercialProposalConfig,
  useUpdateCommercialProposalConfig,
} from "../hooks/useCommercialProposalConfigs";
import type { CommercialProposalConfig } from "../types";

function formatSalary(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "response" in error) {
    const response = (error as { response?: { data?: { error?: string } } }).response;
    if (response?.data?.error) return response.data.error;
  }
  return fallback;
}

type Draft = { name: string; minimum_wage: string };

const emptyDraft: Draft = { name: "", minimum_wage: "" };

export function CommercialCatalog() {
  const { access, isLoading: accessLoading } = useModuleAccess("comercial");
  const configsQuery = useCommercialProposalConfigs();
  const createMutation = useCreateCommercialProposalConfig();
  const updateMutation = useUpdateCommercialProposalConfig();
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState("");

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const canEdit = access.canEdit;

  function startCreate() {
    setIsCreating(true);
    setEditingId(null);
    setDraft(emptyDraft);
    setFormError("");
  }

  function startEdit(config: CommercialProposalConfig) {
    setIsCreating(false);
    setEditingId(config.id);
    setDraft({ name: config.name, minimum_wage: String(config.minimum_wage) });
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
    const minimumWage = Number(draft.minimum_wage.replace(",", "."));

    if (!name) {
      setFormError("Informe o nome da configuração.");
      return;
    }
    if (!Number.isFinite(minimumWage) || minimumWage < 0) {
      setFormError("Informe um salário mínimo maior ou igual a zero.");
      return;
    }

    setFormError("");
    try {
      if (editingId) {
        await updateMutation.mutateAsync({ id: editingId, payload: { name, minimum_wage: minimumWage } });
      } else {
        await createMutation.mutateAsync({ name, minimum_wage: minimumWage });
      }
      cancelForm();
    } catch (error) {
      setFormError(getErrorMessage(error, "Não foi possível salvar a configuração."));
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
    <div className="mx-auto max-w-[1200px] space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-blue-600 dark:text-blue-300">Comercial</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950 dark:text-white">Catálogo de propostas</h1>
          <p className="mt-2 max-w-[65ch] text-base leading-7 text-slate-600 dark:text-slate-300">
            Defina o nome e o salário mínimo usados como base nas configurações comerciais da sua organização.
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
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">Acesso somente leitura.</p>
      ) : null}

      {isCreating || editingId !== null ? (
        <form onSubmit={submitForm} className="rounded-xl border border-blue-200 bg-blue-50/60 p-5 dark:border-blue-900/50 dark:bg-blue-950/20" aria-label={editingId ? "Editar configuração" : "Nova configuração"}>
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px_auto] md:items-end">
            <label className="text-sm font-medium text-slate-800 dark:text-slate-100">Nome
              <input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-slate-600 dark:bg-slate-900 dark:text-white" autoFocus />
            </label>
            <label className="text-sm font-medium text-slate-800 dark:text-slate-100">Salário mínimo
              <input type="text" inputMode="decimal" value={draft.minimum_wage} onChange={(event) => setDraft((current) => ({ ...current, minimum_wage: event.target.value }))} className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base tabular-nums text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-slate-600 dark:bg-slate-900 dark:text-white" placeholder="0,00" />
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
          <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-700"><h2 id="commercial-catalog-title" className="text-lg font-semibold text-slate-950 dark:text-white">Configurações cadastradas</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{configsQuery.data.length} {configsQuery.data.length === 1 ? "item" : "itens"}</p></div>
          <div className="divide-y divide-slate-200 dark:divide-slate-700">
            {configsQuery.data.map((config) => <div key={config.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold text-slate-950 dark:text-white">{config.name}</p><p className="mt-1 text-sm tabular-nums text-slate-500 dark:text-slate-400">Salário mínimo: {formatSalary(config.minimum_wage)}</p></div>{canEdit ? <button type="button" onClick={() => startEdit(config)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"><Pencil className="h-4 w-4" aria-hidden="true" />Editar</button> : null}</div>)}
          </div>
        </section>
      ) : (
        <section className="rounded-xl border border-dashed border-slate-300 px-6 py-12 text-center dark:border-slate-700"><h2 className="text-lg font-semibold text-slate-950 dark:text-white">Nenhuma configuração cadastrada</h2><p className="mx-auto mt-2 max-w-[48ch] text-sm leading-6 text-slate-600 dark:text-slate-300">Crie a primeira configuração para disponibilizar uma base de salário mínimo no Comercial.</p>{canEdit ? <button type="button" onClick={startCreate} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"><Plus className="h-4 w-4" aria-hidden="true" />Criar configuração</button> : null}</section>
      )}
    </div>
  );
}
