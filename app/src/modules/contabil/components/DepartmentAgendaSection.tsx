import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Pencil, Plus, Trash2 } from "lucide-react";

import { ConfirmationDialog } from "@shared/components";
import { useFetch } from "@shared/hooks";
import { agendaService } from "@shared/services/agendaService";
import {
  AGENDA_STATUSES,
  agendaDateToIso,
  agendaDay,
  type AgendaEvent,
  type AgendaEventPayload,
  type AgendaModule,
  type AgendaStatus,
} from "@shared/services/agendaService.contract";
import { Input } from "@shared/ui/newLayout/input";
import { formatCivilDate } from "@shared/utils/dateFormat";

import { departmentAgendaQueryKey } from "../hooks/queryKeys";
import { getContabilErrorMessage } from "../services/contabilError";
import type { ContabilCompetence } from "../types";
import { ContabilCompetenceSelect, CONTABIL_SELECT_CLASS } from "./ContabilCompetenceSelect";
import { getCurrentContabilCompetence } from "./contabilControlSection.helpers";
import { ContabilStateBox } from "./ContabilStateBox";
import { CONTABIL_OUTLINE_ACTION_CLASS } from "./contabilUiClasses";

/** Nome do departamento nos textos da tela. */
const DEPARTMENT_LABEL: Record<AgendaModule, string> = {
  contabil: "Contábil",
  pessoal: "Pessoal",
  triagem: "Triagem",
};

interface DepartmentAgendaSectionProps {
  module: AgendaModule;
  canEdit: boolean;
  /** Oferece a alternância entre a agenda geral e a do usuário atual. */
  allowMine?: boolean;
}

/** Visão de um departamento na agenda compartilhada: o serviço filtra pelo módulo pedido. */
export function DepartmentAgendaSection({
  module,
  canEdit,
  allowMine = false,
}: DepartmentAgendaSectionProps) {
  const departmentLabel = DEPARTMENT_LABEL[module];
  const [month, setMonth] = useState<ContabilCompetence>(getCurrentContabilCompetence);
  const [mine, setMine] = useState(false);
  const [editing, setEditing] = useState<AgendaEvent | "new" | null>(null);
  const [removing, setRemoving] = useState<AgendaEvent | null>(null);
  const queryClient = useQueryClient();
  const events = useFetch(departmentAgendaQueryKey(module, month, mine), () =>
    agendaService.list(module, month, mine),
  );
  const refresh = () => queryClient.invalidateQueries({ queryKey: departmentAgendaQueryKey(module) });

  const save = useMutation({
    mutationFn: (payload: AgendaEventPayload) => {
      if (!editing || editing === "new") return agendaService.create(module, payload);
      // Só o que mudou: evento legado mantém o horário e o estado que já tinha.
      const { date, status, ...rest } = payload;
      return agendaService.update(module, editing.id, {
        ...rest,
        ...(agendaDay(date) === agendaDay(editing.date) ? {} : { date }),
        ...(status === editing.status ? {} : { status }),
      });
    },
    onSuccess: async () => {
      setEditing(null);
      await refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (event: AgendaEvent) => agendaService.remove(module, event.id),
    onSuccess: async () => {
      setRemoving(null);
      await refresh();
    },
  });

  const openForm = (target: AgendaEvent | "new" | null) => {
    save.reset();
    setEditing(target);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    save.mutate({
      agenda: String(form.get("agenda")).trim(),
      date: agendaDateToIso(String(form.get("date"))),
      status: form.get("status") as AgendaStatus,
      obs: String(form.get("obs")).trim() || null,
    });
  };

  const current = editing && editing !== "new" ? editing : null;

  return (
    <section
      className="space-y-5"
      aria-label={`Agenda do departamento ${departmentLabel}`}
      aria-busy={events.isLoading}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Agenda</h2>
          <p className="text-sm text-gray-600 dark:text-slate-400">
            Eventos do departamento {departmentLabel} na agenda compartilhada.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {allowMine &&
            [false, true].map((option) => (
              <button
                key={String(option)}
                type="button"
                className={CONTABIL_OUTLINE_ACTION_CLASS}
                aria-pressed={mine === option}
                onClick={() => setMine(option)}
              >
                {option ? "Minha agenda" : "Agenda geral"}
              </button>
            ))}
          <ContabilCompetenceSelect value={month} onChange={setMonth} label="Mês da agenda" />
          {canEdit && (
            <button
              type="button"
              className={CONTABIL_OUTLINE_ACTION_CLASS}
              onClick={() => openForm("new")}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Novo evento
            </button>
          )}
        </div>
      </div>

      {editing && (
        <form
          key={current?.id ?? "new"}
          onSubmit={handleSubmit}
          aria-label={current ? "Editar evento" : "Novo evento"}
          className="grid gap-3 rounded-xl border border-gray-200 p-4 dark:border-slate-700 sm:grid-cols-2"
        >
          <label className="space-y-1 text-sm font-medium text-gray-700 dark:text-slate-300">
            Título
            <Input name="agenda" required maxLength={200} defaultValue={current?.agenda ?? ""} />
          </label>
          <label className="space-y-1 text-sm font-medium text-gray-700 dark:text-slate-300">
            Data
            <Input
              name="date"
              type="date"
              required
              defaultValue={current ? agendaDay(current.date) : `${month}-01`}
            />
          </label>
          <label className="space-y-1 text-sm font-medium text-gray-700 dark:text-slate-300">
            Assunto
            <Input name="obs" maxLength={2000} defaultValue={current?.obs ?? ""} />
          </label>
          <div className="flex flex-col gap-1">
            <label
              htmlFor={`${module}-agenda-status`}
              className="text-sm font-medium text-gray-700 dark:text-slate-300"
            >
              Estado
            </label>
            <select
              id={`${module}-agenda-status`}
              name="status"
              className={CONTABIL_SELECT_CLASS}
              defaultValue={current?.status ?? "Pendente"}
            >
              {current?.status && !AGENDA_STATUSES.some((status) => status === current.status) && (
                <option value={current.status}>{current.status}</option>
              )}
              {AGENDA_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>
          {save.error && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400 sm:col-span-2">
              {getContabilErrorMessage(save.error)}
            </p>
          )}
          <div className="flex gap-2 sm:col-span-2">
            <button
              type="submit"
              className={CONTABIL_OUTLINE_ACTION_CLASS}
              disabled={save.isPending}
            >
              {save.isPending ? "Salvando..." : "Salvar"}
            </button>
            <button
              type="button"
              className={CONTABIL_OUTLINE_ACTION_CLASS}
              disabled={save.isPending}
              onClick={() => openForm(null)}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {events.isLoading ? (
        <ContabilStateBox icon={CalendarDays} title="Carregando agenda..." tone="loading">
          Buscando os eventos do mês.
        </ContabilStateBox>
      ) : events.isError ? (
        <ContabilStateBox icon={CalendarDays} title="Não foi possível carregar a agenda" tone="danger">
          {getContabilErrorMessage(events.error)}
        </ContabilStateBox>
      ) : !events.data?.length ? (
        <ContabilStateBox icon={CalendarDays} title="Nenhum evento neste mês">
          {canEdit
            ? "Use Novo evento para registrar o primeiro."
            : "Os eventos do departamento aparecem aqui."}
        </ContabilStateBox>
      ) : (
        <ul className="divide-y divide-gray-200 dark:divide-slate-700">
          {events.data.map((event) => (
            <li key={event.id} className="flex flex-wrap items-center gap-3 py-3">
              <span className="w-24 shrink-0 text-sm font-semibold text-gray-900 dark:text-white">
                {formatCivilDate(event.date)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm font-medium text-gray-900 dark:text-white">
                  {event.agenda}
                </p>
                {event.obs && (
                  <p className="break-words text-sm text-gray-600 dark:text-slate-400">
                    {event.obs}
                  </p>
                )}
                {(event.client || event.participant || allowMine) && (
                  <p className="break-words text-xs text-gray-500 dark:text-slate-400">
                    {event.client?.name && `Cliente: ${event.client.name} · `}
                    Responsável: {event.participant?.name ?? "Sem responsável"}
                  </p>
                )}
              </div>
              <span className="text-sm text-gray-600 dark:text-slate-400">
                {event.status ?? "Sem estado"}
              </span>
              {canEdit && (
                <span className="flex gap-2">
                  <button
                    type="button"
                    className={CONTABIL_OUTLINE_ACTION_CLASS}
                    aria-label={`Editar ${event.agenda}`}
                    onClick={() => openForm(event)}
                  >
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className={CONTABIL_OUTLINE_ACTION_CLASS}
                    aria-label={`Remover ${event.agenda}`}
                    onClick={() => {
                      remove.reset();
                      setRemoving(event);
                    }}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <ConfirmationDialog
        open={Boolean(removing)}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
        title="Remover evento"
        description={`Remover "${removing?.agenda ?? ""}" da agenda?`}
        onConfirm={() => {
          if (removing) remove.mutate(removing);
        }}
        isConfirming={remove.isPending}
        errorMessage={remove.error ? getContabilErrorMessage(remove.error) : null}
        confirmLabel="Remover"
        cancelLabel="Cancelar"
      />
    </section>
  );
}
