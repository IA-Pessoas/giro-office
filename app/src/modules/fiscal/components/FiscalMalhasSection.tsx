import { ClientPickerModal, type ClientPickerOption } from "@modules/clients";
import { useAssignableUsers } from "@modules/rh";
import { PaginationControls } from "@shared/components";
import { useFetch } from "@shared/hooks";
import { toast } from "@shared/services/toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, FileSearch, Loader2 } from "lucide-react";
import { type FormEvent, useRef, useState } from "react";

import { fiscalMalhaDetailQueryKey, fiscalMalhasQueryKey } from "../hooks/queryKeys";
import {
  type FiscalMalha,
  type FiscalMalhaPayload,
  fiscalMalhaService,
  MALHA_PAGE_SIZE,
} from "../services/fiscalMalhaService";
import { competenceFromToday, getFiscalErrorMessage } from "../utils";
import {
  FISCAL_MALHA_HISTORY_FIELD_LABELS,
  FISCAL_MALHA_STATUS_LABELS,
  type FiscalMalhaStatus,
  formatMalhaDate,
  formatMalhaHistoryValue,
  formatMalhaPeriod,
} from "../utils/fiscalMalha";
import {
  FISCAL_FIELD_CONTROL_CLASSNAME,
  FISCAL_FIELD_ERROR_CLASSNAME,
  FISCAL_PRIMARY_BUTTON_CLASSNAME,
} from "./fiscalFieldStyles";
import { FiscalStateBox } from "./FiscalStateBox";

const STATUSES = Object.entries(FISCAL_MALHA_STATUS_LABELS) as Array<[FiscalMalhaStatus, string]>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LABEL_CLASSNAME = "grid gap-1 text-sm font-medium text-gray-700 dark:text-gray-300";
const LINK_BUTTON_CLASSNAME = "text-blue-700 hover:underline dark:text-blue-300";

function emptyForm(): FiscalMalhaPayload {
  const lastMonth = competenceFromToday(-1);
  return {
    period_start: lastMonth,
    period_end: lastMonth,
    reason: "",
    deadline: null,
    status: "aberta",
    responsible_id: null,
    task_id: null,
  };
}

export function FiscalMalhasSection({ canEdit }: { canEdit: boolean }) {
  const [client, setClient] = useState<ClientPickerOption | null>(null);
  const [statusFilter, setStatusFilter] = useState<FiscalMalhaStatus | "">("");
  const [responsibleFilter, setResponsibleFilter] = useState("");
  const [page, setPage] = useState(1);
  const [form, setForm] = useState<FiscalMalhaPayload>(emptyForm);
  const [editing, setEditing] = useState<FiscalMalha | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const queryClient = useQueryClient();
  const users = useAssignableUsers({ enabled: Boolean(client), module: "fiscal" });
  const userName = (id: string) => users.data?.find((user) => user.id === id)?.name;

  const clientId = client?.id ?? "";
  const list = useFetch(
    [...fiscalMalhasQueryKey(clientId), statusFilter, responsibleFilter, page],
    () =>
      fiscalMalhaService.list({
        clientId,
        status: statusFilter,
        responsibleId: responsibleFilter,
        page,
      }),
    { enabled: Boolean(client) },
  );
  const history = useFetch(
    fiscalMalhaDetailQueryKey(clientId, historyId ?? ""),
    () => fiscalMalhaService.detail(historyId ?? ""),
    { enabled: Boolean(historyId) },
  );

  const refresh = () => queryClient.invalidateQueries({ queryKey: fiscalMalhasQueryKey(clientId) });

  const save = useMutation({
    mutationFn: (payload: FiscalMalhaPayload) =>
      editing
        ? fiscalMalhaService.update(editing.id, payload)
        : fiscalMalhaService.create(clientId, payload),
    onSuccess: async () => {
      toast.success(editing ? "Malha atualizada." : "Malha cadastrada.");
      resetForm();
      await refresh();
    },
  });
  const upload = useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) =>
      fiscalMalhaService.uploadAttachment(id, file),
    onSuccess: async () => {
      toast.success("Anexo salvo.");
      await refresh();
    },
  });

  function resetForm() {
    setEditing(null);
    setForm(emptyForm());
    setFormError(null);
  }

  function startEditing(item: FiscalMalha) {
    setEditing(item);
    setForm({
      period_start: item.period_start,
      period_end: item.period_end,
      reason: item.reason,
      deadline: item.deadline,
      status: item.status,
      responsible_id: item.responsible_id,
      task_id: item.task_id,
    });
    setFormError(null);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client || !canEdit) return;
    if (!form.reason.trim()) return setFormError("Informe o motivo da malha.");
    if (form.period_start > form.period_end) {
      return setFormError("O fim do período não pode ser anterior ao início.");
    }
    if (form.task_id && !UUID.test(form.task_id)) {
      return setFormError("Informe o ID completo da tarefa ou deixe em branco.");
    }
    setFormError(null);
    try {
      await save.mutateAsync({ ...form, reason: form.reason.trim() });
    } catch (error) {
      toast.error(getFiscalErrorMessage(error));
    }
  }

  async function sendAttachment(id: string, file: File | undefined) {
    if (!file) return;
    try {
      await upload.mutateAsync({ id, file });
    } catch (error) {
      toast.error(getFiscalErrorMessage(error));
    }
  }

  async function openAttachment(id: string) {
    try {
      window.open(await fiscalMalhaService.attachmentUrl(id), "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error(getFiscalErrorMessage(error));
    }
  }

  const set = <K extends keyof FiscalMalhaPayload>(key: K, value: FiscalMalhaPayload[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Malhas fiscais</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Acompanhe as malhas do cliente com prazo, situação, responsável, anexo e tarefa opcional. Mudanças de prazo, situação e responsável ficam no histórico.
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Cliente</p>
        <ClientPickerModal
          filters={{}}
          selectedClient={client}
          onSelectClient={(selection) => {
            setClient(selection);
            setPage(1);
            setHistoryId(null);
            resetForm();
          }}
          triggerLabel="Selecionar cliente"
        />
      </div>

      {client && canEdit ? (
        <form
          ref={formRef}
          noValidate
          onSubmit={(event) => void submit(event)}
          aria-label={editing ? "Editar malha" : "Cadastrar malha"}
          className="grid gap-4 rounded-xl border border-gray-200 p-4 md:grid-cols-3 dark:border-slate-700"
        >
          {editing ? <p className="text-sm font-medium text-blue-700 md:col-span-3 dark:text-blue-300">Editando malha de {formatMalhaPeriod(editing.period_start, editing.period_end)}</p> : null}
          <label className={LABEL_CLASSNAME}>
            Início do período
            <input type="month" required value={form.period_start} onChange={(event) => set("period_start", event.target.value)} className={FISCAL_FIELD_CONTROL_CLASSNAME} />
          </label>
          <label className={LABEL_CLASSNAME}>
            Fim do período
            <input type="month" required value={form.period_end} onChange={(event) => set("period_end", event.target.value)} className={FISCAL_FIELD_CONTROL_CLASSNAME} />
          </label>
          <label className={LABEL_CLASSNAME}>
            Prazo
            <input type="date" value={form.deadline ?? ""} onChange={(event) => set("deadline", event.target.value || null)} className={FISCAL_FIELD_CONTROL_CLASSNAME} />
          </label>
          <label className={LABEL_CLASSNAME}>
            Situação
            <select value={form.status} onChange={(event) => set("status", event.target.value as FiscalMalhaStatus)} className={FISCAL_FIELD_CONTROL_CLASSNAME}>
              {STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className={LABEL_CLASSNAME}>
            Responsável
            <select value={form.responsible_id ?? ""} onChange={(event) => set("responsible_id", event.target.value || null)} className={FISCAL_FIELD_CONTROL_CLASSNAME}>
              <option value="">Sem responsável</option>
              {users.data?.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
            </select>
          </label>
          <label className={LABEL_CLASSNAME}>
            ID da tarefa (opcional)
            <input type="text" value={form.task_id ?? ""} onChange={(event) => set("task_id", event.target.value.trim() || null)} placeholder="Cole o ID da tarefa vinculada" className={FISCAL_FIELD_CONTROL_CLASSNAME} />
          </label>
          <label className={`${LABEL_CLASSNAME} md:col-span-3`}>
            Motivo
            <textarea required rows={3} maxLength={2000} value={form.reason} onChange={(event) => set("reason", event.target.value)} className={`py-2 ${FISCAL_FIELD_CONTROL_CLASSNAME.replace("h-10 ", "")}`} />
          </label>
          {formError ? <p id="fiscal-malha-form-error" role="alert" className={`${FISCAL_FIELD_ERROR_CLASSNAME} md:col-span-3`}>{formError}</p> : null}
          <div className="flex gap-2 md:col-span-3">
            <button type="submit" disabled={save.isPending} className={FISCAL_PRIMARY_BUTTON_CLASSNAME}>
              {save.isPending ? "Salvando..." : editing ? "Salvar alterações" : "Cadastrar malha"}
            </button>
            {editing ? (
              <button type="button" onClick={resetForm} className="h-10 rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-slate-600 dark:text-gray-200 dark:hover:bg-slate-800">
                Cancelar
              </button>
            ) : null}
          </div>
        </form>
      ) : null}

      {client ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-4">
            <h3 className="mr-auto text-base font-semibold text-gray-900 dark:text-white">Malhas do cliente</h3>
            <label className={LABEL_CLASSNAME}>
              Filtrar situação
              <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value as FiscalMalhaStatus | ""); setPage(1); }} className={FISCAL_FIELD_CONTROL_CLASSNAME}>
                <option value="">Todas</option>
                {STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className={LABEL_CLASSNAME}>
              Filtrar responsável
              <select value={responsibleFilter} onChange={(event) => { setResponsibleFilter(event.target.value); setPage(1); }} className={FISCAL_FIELD_CONTROL_CLASSNAME}>
                <option value="">Todos</option>
                {users.data?.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
              </select>
            </label>
          </div>
          {list.isLoading ? (
            <div role="status">
              <FiscalStateBox icon={Loader2} tone="loading" title="Carregando malhas" compact>
                Estamos consultando as malhas do cliente.
              </FiscalStateBox>
            </div>
          ) : null}
          {list.error ? (
            <div role="alert">
              <FiscalStateBox icon={AlertCircle} tone="danger" title="Não foi possível carregar as malhas" compact>
                {getFiscalErrorMessage(list.error)}
              </FiscalStateBox>
            </div>
          ) : null}
          {list.data?.data.length === 0 ? (
            <FiscalStateBox icon={FileSearch} title="Nenhuma malha encontrada" compact>
              Não há malhas para este cliente com os filtros escolhidos.
            </FiscalStateBox>
          ) : null}
          {list.data?.data.length ? (
            <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-slate-700">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Malhas fiscais do cliente</caption>
                <thead className="bg-gray-50 text-gray-600 dark:bg-slate-800 dark:text-gray-300">
                  <tr><th className="px-4 py-3">Período</th><th className="px-4 py-3">Motivo</th><th className="px-4 py-3">Prazo</th><th className="px-4 py-3">Situação</th><th className="px-4 py-3">Responsável</th><th className="px-4 py-3">Anexo</th><th className="px-4 py-3">Ações</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                  {list.data.data.map((item) => {
                    const period = formatMalhaPeriod(item.period_start, item.period_end);
                    return (
                      <tr key={item.id} className="align-top text-gray-800 dark:text-gray-200">
                        <td className="px-4 py-3 whitespace-nowrap">{period}</td>
                        <td className="max-w-xs px-4 py-3"><span className="line-clamp-2">{item.reason}</span>{item.task_id ? <span className="block text-xs text-gray-500 dark:text-gray-400">Tarefa vinculada</span> : null}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{formatMalhaDate(item.deadline)}</td>
                        <td className="px-4 py-3">{FISCAL_MALHA_STATUS_LABELS[item.status]}</td>
                        <td className="px-4 py-3">{item.responsible_id ? (userName(item.responsible_id) ?? "Usuário sem acesso atual") : "Nenhum"}</td>
                        <td className="px-4 py-3">
                          {item.attachment ? (
                            <button type="button" onClick={() => void openAttachment(item.id)} className={LINK_BUTTON_CLASSNAME} aria-label={`Abrir anexo da malha de ${period}`}>
                              {item.attachment.original_name}
                            </button>
                          ) : "Sem anexo"}
                        </td>
                        <td className="space-y-1 px-4 py-3">
                          <button type="button" onClick={() => setHistoryId(historyId === item.id ? null : item.id)} aria-expanded={historyId === item.id} className={`block ${LINK_BUTTON_CLASSNAME}`}>
                            Histórico
                          </button>
                          {canEdit ? (
                            <>
                              <button type="button" onClick={() => startEditing(item)} aria-label={`Editar malha de ${period}`} className={`block ${LINK_BUTTON_CLASSNAME}`}>
                                Editar
                              </button>
                              <label className={`block cursor-pointer ${LINK_BUTTON_CLASSNAME}`}>
                                {item.attachment ? "Substituir anexo" : "Anexar"}
                                <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="sr-only" disabled={upload.isPending} onChange={(event) => { void sendAttachment(item.id, event.target.files?.[0]); event.target.value = ""; }} />
                              </label>
                            </>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <PaginationControls page={page} limit={MALHA_PAGE_SIZE} total={list.data.total} count={list.data.data.length} hasMore={list.data.hasMore} isFetching={list.isFetching} onPrevious={() => setPage((value) => Math.max(1, value - 1))} onNext={() => setPage((value) => value + 1)} />
            </div>
          ) : null}

          {historyId ? (
            <div className="space-y-2 rounded-xl border border-gray-200 p-4 dark:border-slate-700">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Histórico da malha</h4>
              {history.isLoading ? <p role="status" className="text-sm text-gray-600 dark:text-gray-400">Carregando histórico...</p> : null}
              {history.error ? <p role="alert" className={FISCAL_FIELD_ERROR_CLASSNAME}>{getFiscalErrorMessage(history.error)}</p> : null}
              {history.data?.history.length === 0 ? <p className="text-sm text-gray-600 dark:text-gray-400">Sem alterações registradas.</p> : null}
              <ul className="space-y-1 text-sm text-gray-800 dark:text-gray-200">
                {history.data?.history.map((entry) => (
                  <li key={entry.id}>
                    {new Date(entry.created_at).toLocaleString("pt-BR")} · {userName(entry.actor_user_id) ?? "Usuário"} alterou {FISCAL_MALHA_HISTORY_FIELD_LABELS[entry.field].toLowerCase()}: {formatMalhaHistoryValue(entry.field, entry.previous_value, userName)} → {formatMalhaHistoryValue(entry.field, entry.new_value, userName)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : <p className="text-sm text-gray-600 dark:text-gray-400">Selecione um cliente para consultar ou cadastrar malhas.</p>}
    </section>
  );
}
