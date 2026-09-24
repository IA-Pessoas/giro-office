import { useState, type FormEvent } from "react";
import { AlertTriangle, Check, Loader2, RotateCcw } from "lucide-react";

import { getContabilErrorMessage } from "@modules/contabil";
import { useAssignableUsers } from "@modules/rh";

import { useTriageUrgentRequestMutations, useTriageUrgentRequests } from "../hooks";
import type { TriageUrgencyCode } from "../services";

const URGENCY_OPTIONS: Array<{ value: TriageUrgencyCode; label: string }> = [
  { value: "LOW", label: "Baixa" },
  { value: "MEDIUM", label: "Média" },
  { value: "HIGH", label: "Alta" },
  { value: "CRITICAL", label: "Crítica" },
];

const BUTTON_CLASSNAME =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800";
const PRIMARY_BUTTON_CLASSNAME =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60";

function userLabel(user: { name: string | null; full_name: string | null } | null): string {
  return user?.name || user?.full_name || "Não identificado";
}

export function TriageUrgentRequestsSection({
  clientId,
  competence,
  canEdit,
}: {
  clientId: string;
  competence: string;
  canEdit: boolean;
}) {
  const requestsQuery = useTriageUrgentRequests(clientId, competence);
  const mutations = useTriageUrgentRequestMutations(clientId, competence);
  const usersQuery = useAssignableUsers({ enabled: canEdit, module: "triagem" });
  const [urgencyCode, setUrgencyCode] = useState<TriageUrgencyCode>("MEDIUM");
  const [description, setDescription] = useState("");
  const [responsibleId, setResponsibleId] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [closingId, setClosingId] = useState<string | null>(null);
  const [resolutionNote, setResolutionNote] = useState("");
  const users = usersQuery.data ?? [];
  const requests = requestsQuery.data ?? [];
  const error =
    requestsQuery.error ??
    usersQuery.error ??
    mutations.create.error ??
    mutations.update.error ??
    mutations.close.error ??
    mutations.reopen.error;
  const isMutating =
    mutations.create.isPending ||
    mutations.update.isPending ||
    mutations.close.isPending ||
    mutations.reopen.isPending;

  async function createRequest(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const invalid = !responsibleId
      ? "Selecione o responsável da solicitação."
      : !description.trim()
        ? "Descreva a solicitação."
        : null;
    setFormError(invalid);
    if (invalid) return;
    try {
      await mutations.create.mutateAsync({
        urgency_code: urgencyCode,
        description: description.trim(),
        responsible_id: responsibleId,
      });
    } catch {
      return; // mensagem da API aparece no alerta da seção
    }
    setDescription("");
    setResponsibleId("");
  }

  async function closeRequest(event: FormEvent<HTMLFormElement>, id: string): Promise<void> {
    event.preventDefault();
    await mutations.close.mutateAsync({ id, resolutionNote: resolutionNote.trim() });
    setClosingId(null);
    setResolutionNote("");
  }

  if (requestsQuery.isLoading) {
    return (
      <p className="mt-3 flex items-center gap-2 text-sm text-slate-500" role="status">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Carregando solicitações urgentes...
      </p>
    );
  }

  return (
    <section
      className="mt-3 rounded-lg border border-dashed border-amber-300 bg-amber-50/40 p-3 dark:border-amber-900 dark:bg-amber-950/20"
      aria-labelledby={`urgent-requests-${competence}`}
    >
      <div>
        <h3
          id={`urgent-requests-${competence}`}
          className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-slate-100"
        >
          <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden="true" />
          Solicitações urgentes
        </h3>
        <p className="text-xs text-gray-500 dark:text-slate-400">
          Demandas independentes da rotina da competência {competence}.
        </p>
      </div>

      {canEdit ? (
        <form className="mt-3 grid gap-3 sm:grid-cols-2" onSubmit={createRequest} noValidate>
          <label className="text-sm font-medium text-gray-700 dark:text-slate-300">
            Código de urgência
            <select
              aria-label="Código de urgência"
              value={urgencyCode}
              onChange={(event) => setUrgencyCode(event.target.value as TriageUrgencyCode)}
              className="mt-1 block h-10 w-full rounded-lg border border-gray-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-800"
            >
              {URGENCY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-gray-700 dark:text-slate-300">
            Responsável
            <select
              aria-label="Responsável da solicitação urgente"
              required
              value={responsibleId}
              onChange={(event) => setResponsibleId(event.target.value)}
              className="mt-1 block h-10 w-full rounded-lg border border-gray-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-800"
            >
              <option value="" disabled>
                Selecione o responsável
              </option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-gray-700 dark:text-slate-300 sm:col-span-2">
            Solicitação
            <textarea
              aria-label="Descrição da solicitação urgente"
              required
              maxLength={2000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="mt-1 block min-h-20 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
            />
          </label>
          <button type="submit" disabled={isMutating} className={`${PRIMARY_BUTTON_CLASSNAME} sm:col-span-2 sm:justify-self-start`}>
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            Registrar solicitação
          </button>
          {formError ? (
            <p className="text-sm text-red-700 dark:text-red-300 sm:col-span-2" role="alert">
              {formError}
            </p>
          ) : null}
        </form>
      ) : null}

      {error ? (
        <p className="mt-3 text-sm text-red-700 dark:text-red-300" role="alert">
          Não foi possível carregar ou alterar as solicitações. {getContabilErrorMessage(error)}
        </p>
      ) : null}

      {requests.length === 0 ? (
        <p className="mt-3 rounded-lg bg-white/70 p-3 text-sm text-gray-600 dark:bg-slate-900/50 dark:text-slate-400">
          Nenhuma solicitação urgente para esta competência.
        </p>
      ) : (
        <ul className="mt-3 space-y-2" aria-label={`Solicitações urgentes da competência ${competence}`}>
          {requests.map((request) => (
            <li key={request.id} className="rounded-lg border border-amber-200 bg-white p-3 dark:border-amber-900 dark:bg-slate-900">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{request.description}</p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                    {request.urgency_code} · {request.status === "OPEN" ? "Aberta" : "Fechada"} · solicitada por {userLabel(request.requester)} · responsável: {userLabel(request.responsible)}
                  </p>
                  {request.resolution_note ? (
                    <p className="mt-2 text-xs text-gray-600 dark:text-slate-300">
                      Resolução: {request.resolution_note}
                    </p>
                  ) : null}
                </div>
                {canEdit ? (
                  request.status === "OPEN" ? (
                    <button type="button" className={BUTTON_CLASSNAME} onClick={() => setClosingId(request.id)} disabled={isMutating}>
                      <Check className="h-4 w-4" aria-hidden="true" />
                      Fechar
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={BUTTON_CLASSNAME}
                      onClick={() => mutations.reopen.mutate(request.id)}
                      disabled={isMutating}
                    >
                      <RotateCcw className="h-4 w-4" aria-hidden="true" />
                      Reabrir
                    </button>
                  )
                ) : null}
              </div>
              {closingId === request.id ? (
                <form className="mt-3 space-y-2" onSubmit={(event) => closeRequest(event, request.id)}>
                  <label className="text-sm font-medium text-gray-700 dark:text-slate-300">
                    Nota de resolução
                    <textarea
                      aria-label="Nota de resolução"
                      required
                      maxLength={2000}
                      value={resolutionNote}
                      onChange={(event) => setResolutionNote(event.target.value)}
                      className="mt-1 block min-h-16 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button type="submit" className={PRIMARY_BUTTON_CLASSNAME} disabled={isMutating}>
                      Confirmar fechamento
                    </button>
                    <button type="button" className={BUTTON_CLASSNAME} onClick={() => setClosingId(null)}>
                      Cancelar
                    </button>
                  </div>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
