import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Pencil, Plus } from "lucide-react";

import { ClientPickerModal, type ClientPickerOption } from "@modules/clients";
import { departmentService, type DepItem } from "@modules/departments";
import { useAssignableUsers } from "@modules/rh";
import { useFetch } from "@shared/hooks";
import { agendaService } from "@shared/services/agendaService";
import {
  INTEGRACAO_AGENDA_STATUSES,
  type AgendaEvent,
  type AgendaEventPayload,
  type IntegracaoAgendaParticipant,
  type IntegracaoAgendaStatus,
} from "@shared/services/agendaService.contract";
import { Input } from "@shared/ui/newLayout/input";

import { PROJECT_COMPACT_BUTTON_CLASSNAME, PROJECT_INPUT_CLASSNAME } from "./projectUi";

const EMPTY_PAIR: IntegracaoAgendaParticipant = { department_id: "", participant_id: "" };
const queryKey = ["integracao", "agenda"] as const;

function localDateTime(iso: string): { day: string; time: string } {
  const date = new Date(iso);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString();
  return { day: local.slice(0, 10), time: local.slice(11, 16) };
}

function eventParticipants(event: AgendaEvent): IntegracaoAgendaParticipant[] {
  return [
    { department_id: event.department_control_id, participant_id: event.participant?.id ?? "" },
    { department_id: event.department_id_2 ?? "", participant_id: event.participant2?.id ?? "" },
    { department_id: event.department_id_3 ?? "", participant_id: event.participant3?.id ?? "" },
    { department_id: event.department_id_4 ?? "", participant_id: event.participant4?.id ?? "" },
  ].filter((pair) => pair.department_id && pair.participant_id);
}

function ParticipantPair({
  index,
  value,
  departments,
  fallbackName,
  onChange,
  onRemove,
}: {
  index: number;
  value: IntegracaoAgendaParticipant;
  departments: DepItem[];
  fallbackName?: string;
  onChange: (value: IntegracaoAgendaParticipant) => void;
  onRemove?: () => void;
}) {
  const users = useAssignableUsers({
    departmentId: value.department_id,
    enabled: Boolean(value.department_id),
  });
  const selectedInCatalog = users.data?.some((user) => user.id === value.participant_id);

  return (
    <div className="grid gap-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700 sm:grid-cols-[1fr_1fr_auto]">
      <label className="space-y-1 text-sm text-slate-700 dark:text-slate-300">
        Departamento {index + 1}
        <select
          className={PROJECT_INPUT_CLASSNAME}
          value={value.department_id}
          required={index === 0}
          onChange={(event) => onChange({ department_id: event.target.value, participant_id: "" })}
        >
          <option value="">Selecione</option>
          {departments.map((department) => (
            <option key={department.id} value={department.id}>
              {department.name}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1 text-sm text-slate-700 dark:text-slate-300">
        Participante {index + 1}
        <select
          className={PROJECT_INPUT_CLASSNAME}
          value={value.participant_id}
          required={index === 0 || Boolean(value.department_id)}
          disabled={!value.department_id || users.isLoading || users.isError}
          onChange={(event) => onChange({ ...value, participant_id: event.target.value })}
        >
          <option value="">Selecione</option>
          {value.participant_id && !selectedInCatalog && (
            <option value={value.participant_id}>{fallbackName ?? "Participante atual"}</option>
          )}
          {users.data?.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name}
            </option>
          ))}
        </select>
        {users.isError && <span role="alert" className="text-red-600">Não foi possível carregar participantes.</span>}
      </label>
      {onRemove && (
        <button type="button" className={PROJECT_COMPACT_BUTTON_CLASSNAME} onClick={onRemove}>
          Remover
        </button>
      )}
    </div>
  );
}

export function IntegrationAgendaSection({ canEdit }: { canEdit: boolean }) {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [mine, setMine] = useState(false);
  const [editing, setEditing] = useState<AgendaEvent | "new" | null>(null);
  const [client, setClient] = useState<ClientPickerOption | null>(null);
  const [pairs, setPairs] = useState<IntegracaoAgendaParticipant[]>([{ ...EMPTY_PAIR }]);
  const [formError, setFormError] = useState("");
  const queryClient = useQueryClient();
  const events = useFetch([...queryKey, month, mine], () => agendaService.list("integracao", month, mine));
  const departments = useFetch([...queryKey, "departments"], () => departmentService.list());
  const save = useMutation({
    mutationFn: async (payload: AgendaEventPayload) => {
      if (editing && editing !== "new") {
        const changes: Partial<AgendaEventPayload> = {};
        if (payload.agenda !== editing.agenda) changes.agenda = payload.agenda;
        const originalDateTime = localDateTime(editing.date);
        const submittedDateTime = localDateTime(payload.date);
        if (originalDateTime.day !== submittedDateTime.day || originalDateTime.time !== submittedDateTime.time) {
          changes.date = payload.date;
        }
        if (payload.status !== editing.status) changes.status = payload.status;
        if (payload.obs !== editing.obs) changes.obs = payload.obs;
        if (payload.location !== editing.location) changes.location = payload.location;
        if (payload.client_id !== editing.client?.id) changes.client_id = payload.client_id;
        if (JSON.stringify(payload.participants) !== JSON.stringify(eventParticipants(editing))) {
          changes.participants = payload.participants;
        }
        if (Object.keys(changes).length) await agendaService.update("integracao", editing.id, changes);
      } else {
        await agendaService.create("integracao", payload);
      }
    },
    onSuccess: async () => {
      setEditing(null);
      await queryClient.invalidateQueries({ queryKey });
    },
  });

  const openForm = (target: AgendaEvent | "new") => {
    save.reset();
    setFormError("");
    setClient(target === "new" ? null : target.client);
    setPairs(target === "new" ? [{ ...EMPTY_PAIR }] : eventParticipants(target));
    setEditing(target);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const participants = pairs.filter((pair) => pair.department_id && pair.participant_id);
    if (!client || participants.length !== pairs.length || !participants.length) {
      setFormError("Informe o cliente e complete os pares de departamento e participante.");
      return;
    }
    setFormError("");
    save.mutate({
      agenda: String(form.get("agenda")).trim(),
      date: new Date(`${form.get("day")}T${form.get("time")}:00`).toISOString(),
      status: (editing === "new" ? "Pendente" : form.get("status")) as IntegracaoAgendaStatus,
      obs: String(form.get("obs")).trim() || null,
      location: String(form.get("location")).trim() || null,
      client_id: client.id,
      participants,
    });
  };

  const current = editing && editing !== "new" ? editing : null;
  const dateTime = current ? localDateTime(current.date) : { day: `${month}-01`, time: "09:00" };

  return (
    <section aria-label="Agenda de Integração" className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Compromissos</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">Consulte os compromissos da organização por mês.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm text-slate-700 dark:text-slate-300">
            Mês
            <Input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
          </label>
          <button type="button" aria-pressed={mine} className={PROJECT_COMPACT_BUTTON_CLASSNAME} onClick={() => setMine((value) => !value)}>
            Minha agenda
          </button>
          {canEdit && <button type="button" className={PROJECT_COMPACT_BUTTON_CLASSNAME} onClick={() => openForm("new")}><Plus className="h-4 w-4" />Novo compromisso</button>}
        </div>
      </div>

      {editing && (
        <form key={current?.id ?? "new"} aria-label={current ? "Editar compromisso" : "Novo compromisso"} onSubmit={submit} className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm text-slate-700 dark:text-slate-300">Pauta<Input name="agenda" required maxLength={200} defaultValue={current?.agenda ?? ""} /></label>
            <label className="text-sm text-slate-700 dark:text-slate-300">Local<Input name="location" maxLength={200} defaultValue={current?.location ?? ""} /></label>
            <label className="text-sm text-slate-700 dark:text-slate-300">Data<Input name="day" type="date" required defaultValue={dateTime.day} /></label>
            <label className="text-sm text-slate-700 dark:text-slate-300">Hora<Input name="time" type="time" required defaultValue={dateTime.time} /></label>
            <label className="text-sm text-slate-700 dark:text-slate-300 sm:col-span-2">Observações<Input name="obs" maxLength={2000} defaultValue={current?.obs ?? ""} /></label>
            {current && <label className="text-sm text-slate-700 dark:text-slate-300">Estado<select name="status" className={PROJECT_INPUT_CLASSNAME} defaultValue={current.status ?? "Pendente"}>{current.status && !INTEGRACAO_AGENDA_STATUSES.some((status) => status === current.status) && <option value={current.status}>{current.status}</option>}{INTEGRACAO_AGENDA_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>}
          </div>
          <div>
            <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Cliente *</span>
            <ClientPickerModal selectedClient={client} onSelectClient={setClient} filters={{ status: "Ativo", legacyIntegrationStatusFilter: false }} triggerLabel="Selecione o cliente" />
            {!client && <p className="text-xs text-slate-600 dark:text-slate-400">Selecione um cliente para salvar.</p>}
          </div>
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Departamentos e participantes</h3>
            {pairs.map((pair, index) => (
              <ParticipantPair
                key={index}
                index={index}
                value={pair}
                departments={departments.data ?? []}
                fallbackName={current ? [current.participant, current.participant2, current.participant3, current.participant4][index]?.name : undefined}
                onChange={(value) => setPairs((current) => current.map((item, position) => position === index ? value : item))}
                onRemove={index ? () => setPairs((current) => current.filter((_, position) => position !== index)) : undefined}
              />
            ))}
            {departments.isError && <p role="alert" className="text-sm text-red-600">Não foi possível carregar departamentos.</p>}
            {pairs.length < 4 && <button type="button" className={PROJECT_COMPACT_BUTTON_CLASSNAME} onClick={() => setPairs((current) => [...current, { ...EMPTY_PAIR }])}>Adicionar participante</button>}
          </div>
          {save.error && <p role="alert" className="text-sm text-red-600">Não foi possível salvar o compromisso.</p>}
          {formError && <p role="alert" className="text-sm text-red-600">{formError}</p>}
          <div className="flex gap-2">
            <button type="submit" className={PROJECT_COMPACT_BUTTON_CLASSNAME} disabled={save.isPending || !client || departments.isError}>Salvar</button>
            <button type="button" className={PROJECT_COMPACT_BUTTON_CLASSNAME} disabled={save.isPending} onClick={() => setEditing(null)}>Cancelar</button>
          </div>
        </form>
      )}

      {events.isLoading ? <p className="text-sm text-slate-600">Carregando agenda...</p> : events.isError ? <p role="alert" className="text-sm text-red-600">Não foi possível carregar a agenda.</p> : !events.data?.length ? <p className="rounded-lg border border-slate-200 p-6 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-400">Nenhum compromisso neste mês.</p> : (
        <ul className="divide-y divide-slate-200 dark:divide-slate-700">
          {events.data.map((item) => (
            <li key={item.id} className="flex flex-wrap items-start gap-3 py-3">
              <CalendarDays className="mt-1 h-4 w-4 text-blue-600" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-900 dark:text-white">{item.agenda}</p>
                <p className="text-sm text-slate-600 dark:text-slate-400">{new Date(item.date).toLocaleString("pt-BR")} · {item.client?.name ?? "Cliente não identificado"}{item.location ? ` · ${item.location}` : ""}</p>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {[item.participant, item.participant2, item.participant3, item.participant4].map((participant, index) => {
                    if (!participant) return null;
                    const departmentId = [item.department_control_id, item.department_id_2, item.department_id_3, item.department_id_4][index];
                    const department = departments.data?.find((entry) => entry.id === departmentId)?.name;
                    return `${department ?? "Departamento"}: ${participant.name}`;
                  }).filter(Boolean).join(" · ")}
                </p>
              </div>
              <span className="text-sm text-slate-700 dark:text-slate-300">{item.status ?? "Sem estado"}</span>
              {canEdit && <button type="button" className={PROJECT_COMPACT_BUTTON_CLASSNAME} aria-label={`Editar ${item.agenda}`} onClick={() => openForm(item)}><Pencil className="h-4 w-4" /></button>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
