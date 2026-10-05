import { useState, type FormEvent } from "react";
import { CalendarDays, Eye, Pencil, Plus, RefreshCw } from "lucide-react";

import { useModuleAccess } from "@modules/auth";
import { Dialog } from "@shared/components";

import { marketingFormControlClass, marketingFormTextareaClass } from "./marketingFormStyles";
import {
  marketingIconButtonClass,
  marketingPrimaryButtonClass,
  marketingSecondaryButtonClass,
} from "./marketingButtonStyles";
import { MarketingEventEditions } from "./MarketingEventEditions";
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
          className={marketingFormControlClass}
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
  const [viewingEvent, setViewingEvent] = useState<MarketingEvent | null>(null);
  const [editionsEvent, setEditionsEvent] = useState<MarketingEvent | null>(null);
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

    try {
      if (editingEvent) {
        const payload: MarketingEventPayload = { ...draft, priority: draft.priority };
        await updateMutation.mutateAsync({ id: editingEvent.id, payload });
      } else {
        await createMutation.mutateAsync({
          name: draft.name,
          logo: draft.logo,
          priority: draft.priority,
          objective: draft.objective,
          audience: draft.audience,
        });
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
          className={`mt-3 ${marketingSecondaryButtonClass}`}
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
            className={marketingPrimaryButtonClass}
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
                <th className="px-3 py-2" scope="col"><span className="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr className="border-b border-gray-100 last:border-0 dark:border-slate-800" key={event.id}>
                  <td className="px-3 py-3 font-medium text-gray-900 dark:text-white">{event.name}</td>
                  <td className="px-3 py-3 text-gray-700 dark:text-slate-200">{event.status}</td>
                  <td className="px-3 py-3 text-gray-700 dark:text-slate-200">{event.priority}</td>
                  <td className="max-w-64 truncate px-3 py-3 text-gray-700 dark:text-slate-200">{event.audience}</td>
                  <td className="px-3 py-3 text-right">
                      <button
                        aria-label={`Ver edições de ${event.name}`}
                        className={marketingIconButtonClass}
                        onClick={() => setEditionsEvent(event)}
                        type="button"
                      >
                        <CalendarDays aria-hidden="true" className="h-4 w-4" />
                      </button>
                      <button
                        aria-label={`Ver evento ${event.name}`}
                        className={marketingIconButtonClass}
                        onClick={() => setViewingEvent(event)}
                        type="button"
                      >
                        <Eye aria-hidden="true" className="h-4 w-4" />
                      </button>
                      {access.canEdit ? (
                      <button
                        aria-label={`Editar evento ${event.name}`}
                        className={marketingIconButtonClass}
                        onClick={() => startEdit(event)}
                        type="button"
                      >
                        <Pencil aria-hidden="true" className="h-4 w-4" />
                      </button>
                      ) : null}
                    </td>
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
              className={marketingSecondaryButtonClass}
              disabled={isSaving}
              onClick={() => setDialogOpen(false)}
              type="button"
            >
              Cancelar
            </button>
            <button
              className={marketingPrimaryButtonClass}
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
            {editingEvent ? <Field label="Status" name="status" onChange={(status) => setDraft((current) => ({ ...current, status: status as MarketingEventPayload["status"] }))} value={draft.status}>
              <select
                className={marketingFormControlClass}
                id="marketing-event-status"
                name="status"
                onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as MarketingEventPayload["status"] }))}
                value={draft.status}
              >
                {MARKETING_EVENT_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </Field> : <p className="text-sm text-gray-600 dark:text-slate-300">Status inicial: Novo</p>}
            <Field label="Prioridade" name="priority" onChange={(priority) => setDraft((current) => ({ ...current, priority: priority as MarketingEventPriority | "" }))} required value={draft.priority}>
              <select
                className={marketingFormControlClass}
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
            <textarea className={marketingFormTextareaClass} id="marketing-event-objective" name="objective" onChange={(event) => setDraft((current) => ({ ...current, objective: event.target.value }))} value={draft.objective} />
          </label>
          <label className="block space-y-1.5 text-sm font-medium text-gray-700 dark:text-slate-200" htmlFor="marketing-event-audience">
            Público-alvo
            <textarea className={marketingFormTextareaClass} id="marketing-event-audience" name="audience" onChange={(event) => setDraft((current) => ({ ...current, audience: event.target.value }))} value={draft.audience} />
          </label>
        </form>
      </Dialog>

      <Dialog
        description="Dados completos do evento"
        footer={(
          <button
            className={marketingSecondaryButtonClass}
            onClick={() => setViewingEvent(null)}
            type="button"
          >Fechar</button>
        )}
        onOpenChange={(open) => { if (!open) setViewingEvent(null); }}
        open={viewingEvent !== null}
        title={viewingEvent?.name ?? "Detalhes do evento"}
      >
        {viewingEvent ? (
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div><dt className="font-semibold text-gray-700 dark:text-slate-200">Logo</dt><dd className="mt-1 break-all text-gray-600 dark:text-slate-300">{viewingEvent.logo ? <><img alt={`Logo de ${viewingEvent.name}`} className="mb-2 max-h-20 max-w-40 object-contain" decoding="async" src={viewingEvent.logo} />{viewingEvent.logo}</> : "—"}</dd></div>
            <div><dt className="font-semibold text-gray-700 dark:text-slate-200">Status</dt><dd className="mt-1 text-gray-600 dark:text-slate-300">{viewingEvent.status}</dd></div>
            <div><dt className="font-semibold text-gray-700 dark:text-slate-200">Prioridade</dt><dd className="mt-1 text-gray-600 dark:text-slate-300">{viewingEvent.priority}</dd></div>
            <div><dt className="font-semibold text-gray-700 dark:text-slate-200">Público-alvo</dt><dd className="mt-1 whitespace-pre-wrap text-gray-600 dark:text-slate-300">{viewingEvent.audience || "—"}</dd></div>
            <div className="sm:col-span-2"><dt className="font-semibold text-gray-700 dark:text-slate-200">Objetivo</dt><dd className="mt-1 whitespace-pre-wrap text-gray-600 dark:text-slate-300">{viewingEvent.objective || "—"}</dd></div>
          </dl>
        ) : null}
      </Dialog>
      {editionsEvent ? (
        <MarketingEventEditions
          canEdit={access.canEdit}
          event={editionsEvent}
          onOpenChange={(open) => { if (!open) setEditionsEvent(null); }}
          open={editionsEvent !== null}
        />
      ) : null}
    </section>
  );
}
