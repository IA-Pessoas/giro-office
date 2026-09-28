import { useState, type FormEvent } from "react";
import { Pencil, Plus, RefreshCw } from "lucide-react";

import { useModuleAccess } from "@modules/auth";
import { Dialog } from "@shared/components";

import {
  useCreateMarketingEvent,
  useMarketingEvents,
  useUpdateMarketingEvent,
} from "../hooks/useMarketingEvents";
import {
  MARKETING_EVENT_PRIORITIES,
  MARKETING_EVENT_STATUSES,
  type MarketingEvent,
  type MarketingEventPayload,
  type MarketingEventPriority,
} from "../types/marketingEvent";

type EventDraft = Omit<MarketingEventPayload, "priority"> & {
  priority: MarketingEventPriority | "";
};

const emptyDraft: EventDraft = {
  name: "",
  logo: "",
  status: "Novo",
  priority: "",
  objective: "",
  audience: "",
};

function getErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "response" in error) {
    const response = (error as { response?: { data?: { error?: string } } }).response;
    if (response?.data?.error) return response.data.error;
  }
  return "Não foi possível salvar o evento. Tente novamente.";
}

function Field({
  label,
  name,
  value,
  onChange,
  required = false,
  maxLength,
  children,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  maxLength?: number;
  children?: React.ReactNode;
}) {
  const id = `marketing-event-${name}`;
  return (
    <label className="block space-y-1.5 text-sm font-medium text-gray-700 dark:text-slate-200" htmlFor={id}>
      <span>{label}{required ? " *" : ""}</span>
      {children ?? (
        <input
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
          id={id}
          maxLength={maxLength}
          name={name}
          onChange={(event) => onChange(event.target.value)}
          required={required}
          value={value}
        />
      )}
    </label>
  );
}

export function MarketingEvents() {
  const { access, isLoading: accessLoading } = useModuleAccess("marketing");
  const query = useMarketingEvents();
  const createMutation = useCreateMarketingEvent();
  const updateMutation = useUpdateMarketingEvent();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<MarketingEvent | null>(null);
  const [draft, setDraft] = useState<EventDraft>(emptyDraft);
  const [formError, setFormError] = useState("");
  const isSaving = createMutation.isPending || updateMutation.isPending;

  function startCreate() {
    setEditingEvent(null);
    setDraft(emptyDraft);
    setFormError("");
    setDialogOpen(true);
  }

  function startEdit(event: MarketingEvent) {
    setEditingEvent(event);
    setDraft({
      name: event.name,
      logo: event.logo,
      status: event.status,
      priority: event.priority,
      objective: event.objective,
      audience: event.audience,
    });
    setFormError("");
    setDialogOpen(true);
  }

  async function saveEvent(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    setFormError("");
    if (!draft.priority) {
      setFormError("Selecione uma prioridade para o evento.");
      return;
    }

    const payload: MarketingEventPayload = { ...draft, priority: draft.priority };
    try {
      if (editingEvent) {
        await updateMutation.mutateAsync({ id: editingEvent.id, payload });
      } else {
        await createMutation.mutateAsync(payload);
      }
      setDialogOpen(false);
    } catch (error: unknown) {
      setFormError(getErrorMessage(error));
    }
  }

  if (query.isLoading || accessLoading) {
    return (
      <section aria-label="Eventos de Marketing" className="rounded-xl border border-gray-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
        <p aria-live="polite" className="text-sm text-gray-600 dark:text-slate-300" role="status">
          Carregando eventos…
        </p>
      </section>
    );
  }

  if (query.isError) {
    return (
      <section aria-label="Eventos de Marketing" className="rounded-xl border border-gray-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
        <p className="text-sm text-red-700 dark:text-red-300" role="alert">
          Não foi possível carregar os eventos.
        </p>
        <button
          className="mt-3 inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
          onClick={() => void query.refetch()}
          type="button"
        >
          <RefreshCw aria-hidden="true" className="h-4 w-4" />
          Tentar novamente
        </button>
      </section>
    );
  }

  const events = query.data ?? [];
  const isEmpty = query.data?.length === 0;

  return (
    <section aria-label="Eventos de Marketing" className="rounded-xl border border-gray-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Eventos</h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-slate-300">Cadastro da organização</p>
        </div>
        {!accessLoading && access.canEdit ? (
          <button
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            onClick={startCreate}
            type="button"
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
            Novo evento
          </button>
        ) : null}
      </header>

      {isEmpty ? (
        <p className="mt-5 rounded-lg bg-gray-50 px-4 py-6 text-sm text-gray-600 dark:bg-slate-800 dark:text-slate-300">
          Nenhum evento cadastrado para esta organização.
        </p>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[680px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500 dark:border-slate-700 dark:text-slate-400">
                <th className="px-3 py-2 font-semibold" scope="col">Nome</th>
                <th className="px-3 py-2 font-semibold" scope="col">Status</th>
                <th className="px-3 py-2 font-semibold" scope="col">Prioridade</th>
                <th className="px-3 py-2 font-semibold" scope="col">Público-alvo</th>
                {access.canEdit ? <th className="px-3 py-2" scope="col"><span className="sr-only">Ações</span></th> : null}
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr className="border-b border-gray-100 last:border-0 dark:border-slate-800" key={event.id}>
                  <td className="px-3 py-3 font-medium text-gray-900 dark:text-white">{event.name}</td>
                  <td className="px-3 py-3 text-gray-700 dark:text-slate-200">{event.status}</td>
                  <td className="px-3 py-3 text-gray-700 dark:text-slate-200">{event.priority}</td>
                  <td className="max-w-64 truncate px-3 py-3 text-gray-700 dark:text-slate-200">{event.audience}</td>
                  {access.canEdit ? (
                    <td className="px-3 py-3 text-right">
                      <button
                        aria-label={`Editar evento ${event.name}`}
                        className="rounded-md p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                        onClick={() => startEdit(event)}
                        type="button"
                      >
                        <Pencil aria-hidden="true" className="h-4 w-4" />
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog
        description={editingEvent ? "Editar cadastro de evento" : "Cadastrar novo evento"}
        footer={(
          <>
            <button
              className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
              disabled={isSaving}
              onClick={() => setDialogOpen(false)}
              type="button"
            >
              Cancelar
            </button>
            <button
              className="rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              disabled={isSaving}
              form="marketing-event-form"
              type="submit"
            >
              {isSaving ? "Salvando…" : "Salvar evento"}
            </button>
          </>
        )}
        onOpenChange={setDialogOpen}
        open={dialogOpen}
        title={editingEvent ? "Editar evento" : "Novo evento"}
      >
        <form className="space-y-4" id="marketing-event-form" onSubmit={saveEvent}>
          {formError ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300" role="alert">{formError}</p> : null}
          <Field label="Nome" maxLength={50} name="name" onChange={(name) => setDraft((current) => ({ ...current, name }))} required value={draft.name} />
          <Field label="Logo (caminho ou URL)" maxLength={100} name="logo" onChange={(logo) => setDraft((current) => ({ ...current, logo }))} value={draft.logo} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Status" name="status" onChange={(status) => setDraft((current) => ({ ...current, status: status as MarketingEventPayload["status"] }))} value={draft.status}>
              <select
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                id="marketing-event-status"
                name="status"
                onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as MarketingEventPayload["status"] }))}
                value={draft.status}
              >
                {MARKETING_EVENT_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </Field>
            <Field label="Prioridade" name="priority" onChange={(priority) => setDraft((current) => ({ ...current, priority: priority as MarketingEventPriority | "" }))} required value={draft.priority}>
              <select
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                id="marketing-event-priority"
                name="priority"
                onChange={(event) => setDraft((current) => ({ ...current, priority: event.target.value as MarketingEventPriority | "" }))}
                required
                value={draft.priority}
              >
                <option value="">Selecione uma</option>
                {MARKETING_EVENT_PRIORITIES.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
              </select>
            </Field>
          </div>
          <label className="block space-y-1.5 text-sm font-medium text-gray-700 dark:text-slate-200" htmlFor="marketing-event-objective">
            Objetivo
            <textarea className="min-h-24 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-900 dark:text-white" id="marketing-event-objective" name="objective" onChange={(event) => setDraft((current) => ({ ...current, objective: event.target.value }))} value={draft.objective} />
          </label>
          <label className="block space-y-1.5 text-sm font-medium text-gray-700 dark:text-slate-200" htmlFor="marketing-event-audience">
            Público-alvo
            <textarea className="min-h-24 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-900 dark:text-white" id="marketing-event-audience" name="audience" onChange={(event) => setDraft((current) => ({ ...current, audience: event.target.value }))} value={draft.audience} />
          </label>
        </form>
      </Dialog>
    </section>
  );
}
