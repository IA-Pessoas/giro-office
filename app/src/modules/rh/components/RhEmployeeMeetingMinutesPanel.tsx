import { useState } from "react";
import { FileClock, Pencil, Plus, Save, X } from "lucide-react";
import { toast } from "@shared/services/toast";

import {
  useCreateRhMeetingMinuteMutation,
  useRhMeetingMinutes,
  useUpdateRhMeetingMinuteMutation,
} from "../hooks/useRhProfile";
import type { RhEmployeeMeetingMinute } from "../types";

type Draft = { meeting_date: string; agenda: string; participants: string; report: string };

const EMPTY_DRAFT: Draft = { meeting_date: "", agenda: "", participants: "", report: "" };

export function RhEmployeeMeetingMinutesPanel({
  userId,
  canEdit,
}: {
  userId: string;
  canEdit: boolean;
}) {
  const minutesQuery = useRhMeetingMinutes(userId);
  const createMutation = useCreateRhMeetingMinuteMutation();
  const updateMutation = useUpdateRhMeetingMinuteMutation();
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);

  function edit(minute: RhEmployeeMeetingMinute) {
    setEditingId(minute.id);
    setDraft({
      meeting_date: minute.meeting_date,
      agenda: minute.agenda,
      participants: minute.participants,
      report: minute.report,
    });
  }

  function cancel() {
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
  }

  async function save() {
    if (!draft.meeting_date || !draft.agenda.trim()) {
      toast.error("Informe a data e a pauta da ata.");
      return;
    }
    if (editingId && !draft.report.trim()) {
      toast.error("Informe o relato para atualizar a ata.");
      return;
    }
    try {
      if (editingId) {
        await updateMutation.mutateAsync({ id: editingId, ...draft });
        toast.success("Ata de RH atualizada.");
      } else {
        await createMutation.mutateAsync({
          target_user_id: userId,
          ...draft,
        });
        toast.success("Ata de RH registrada.");
      }
      cancel();
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : "Não foi possível salvar a ata.");
    }
  }

  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <section className="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-5 py-4 dark:border-gray-700">
        <div>
          <div className="flex items-center gap-2 text-gray-900 dark:text-white">
            <FileClock className="h-4 w-4 text-blue-600 dark:text-blue-300" />
            <h3 className="font-semibold">Atas de reunião de RH</h3>
          </div>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Registros internos do colaborador com histórico de autoria e alterações.
          </p>
        </div>
        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-200">
          RH
        </span>
      </div>

      {canEdit ? (
        <div className="space-y-3 border-b border-gray-200 p-5 dark:border-gray-700">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
            {editingId ? "Editar ata" : "Registrar ata"}
          </h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-xs font-medium text-gray-600 dark:text-gray-300">
              Data
              <input
                aria-label="Data da reunião"
                type="date"
                value={draft.meeting_date}
                onChange={(event) => setDraft({ ...draft, meeting_date: event.target.value })}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
              />
            </label>
            <label className="space-y-1 text-xs font-medium text-gray-600 dark:text-gray-300">
              Pauta
              <input
                aria-label="Pauta da reunião"
                maxLength={500}
                value={draft.agenda}
                onChange={(event) => setDraft({ ...draft, agenda: event.target.value })}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
              />
            </label>
          </div>
          <label className="block space-y-1 text-xs font-medium text-gray-600 dark:text-gray-300">
            Participantes
            <textarea
              aria-label="Participantes da reunião"
              maxLength={5000}
              rows={2}
              value={draft.participants}
              onChange={(event) => setDraft({ ...draft, participants: event.target.value })}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
            />
          </label>
          <label className="block space-y-1 text-xs font-medium text-gray-600 dark:text-gray-300">
            Relato {editingId ? "(obrigatório na edição)" : "(opcional)"}
            <textarea
              aria-label="Relato da reunião"
              maxLength={20000}
              rows={4}
              value={draft.report}
              onChange={(event) => setDraft({ ...draft, report: event.target.value })}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
            />
          </label>
          <div className="flex justify-end gap-2">
            {editingId ? (
              <button
                type="button"
                onClick={cancel}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 dark:border-gray-600 dark:text-gray-300"
              >
                <X className="h-4 w-4" />
                Cancelar
              </button>
            ) : null}
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
            >
              {editingId ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {saving ? "Salvando..." : editingId ? "Salvar alterações" : "Adicionar ata"}
            </button>
          </div>
        </div>
      ) : null}

      <div className="space-y-3 p-5">
        {minutesQuery.isLoading ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Carregando atas...</p>
        ) : minutesQuery.error ? (
          <p role="alert" className="text-sm text-red-600 dark:text-red-300">
            Não foi possível carregar as atas autorizadas.
          </p>
        ) : minutesQuery.data?.length ? (
          minutesQuery.data.map((minute) => (
            <article
              key={minute.id}
              className="rounded-lg border border-gray-200 p-4 dark:border-gray-700"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {new Date(`${minute.meeting_date}T12:00:00`).toLocaleDateString("pt-BR")}
                  </p>
                  <h4 className="mt-1 font-semibold text-gray-900 dark:text-white">{minute.agenda}</h4>
                </div>
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => edit(minute)}
                    aria-label={`Editar ata ${minute.agenda}`}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-blue-700 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-900/30"
                  >
                    <Pencil className="h-4 w-4" />
                    Editar
                  </button>
                ) : null}
              </div>
              <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Participantes
                  </dt>
                  <dd className="mt-1 whitespace-pre-line text-gray-800 dark:text-gray-200">
                    {minute.participants || "Não informados"}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Relato
                  </dt>
                  <dd className="mt-1 whitespace-pre-line text-gray-800 dark:text-gray-200">
                    {minute.report || "Relato ainda não informado."}
                  </dd>
                </div>
              </dl>
              <details className="mt-4 border-t border-gray-100 pt-3 dark:border-gray-700">
                <summary className="cursor-pointer text-sm font-medium text-blue-700 dark:text-blue-300">
                  Histórico · {minute.revisions.length} {minute.revisions.length === 1 ? "versão" : "versões"}
                </summary>
                <ol className="mt-3 space-y-3">
                  {minute.revisions.map((revision) => (
                    <li
                      key={revision.id}
                      className="rounded-md bg-gray-50 p-3 text-sm dark:bg-gray-900/50"
                    >
                      <p className="font-medium text-gray-900 dark:text-white">
                        Versão {revision.version} · {revision.action === "Created" ? "criada" : "editada"}
                      </p>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {revision.changed_by_name} · {new Date(revision.changed_at).toLocaleString("pt-BR")}
                      </p>
                      <p className="mt-2 text-gray-700 dark:text-gray-300">
                        {revision.meeting_date} · {revision.agenda}
                      </p>
                      {revision.participants ? (
                        <p className="mt-1 whitespace-pre-line text-gray-600 dark:text-gray-400">
                          Participantes: {revision.participants}
                        </p>
                      ) : null}
                      <p className="mt-1 whitespace-pre-line text-gray-600 dark:text-gray-400">
                        {revision.report || "Sem relato nesta versão."}
                      </p>
                    </li>
                  ))}
                </ol>
              </details>
            </article>
          ))
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400">Nenhuma ata de RH registrada.</p>
        )}
      </div>
    </section>
  );
}
