import { useState } from "react";
import { Archive, CalendarPlus, Loader2, RotateCcw } from "lucide-react";

import { getContabilErrorMessage } from "@modules/contabil";

import {
  useTriageCompetenceMutations,
  useTriageCompetences,
} from "../hooks";
import { TriageExternalLinksSection } from "./TriageExternalLinksSection";
import { TriageUrgentRequestsSection } from "./TriageUrgentRequestsSection";
import { TriageAuditTimeline } from "./TriageAuditTimeline";
import { formatTriageCompetence } from "./triagem.helpers";

function currentCompetence(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}


export function TriageCompetenceSection({
  clientId,
  canEdit,
}: {
  clientId: string;
  canEdit: boolean;
}) {
  const [competence, setCompetence] = useState(currentCompetence);
  const competences = useTriageCompetences(clientId);
  const mutations = useTriageCompetenceMutations(clientId);
  const actionError = mutations.create.error ?? mutations.archive.error;

  function createCompetence(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!competence) return;
    mutations.create.mutate(competence);
  }

  function archiveCompetence(id: string) {
    if (window.confirm("Arquivar esta competência da Triagem?")) {
      mutations.archive.mutate(id);
    }
  }

  function renderCompetenceContent() {
    if (competences.isLoading) {
      return (
        <p className="mt-4 flex items-center gap-2 text-sm text-slate-500" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Carregando competências...
        </p>
      );
    }

    if (competences.isError) {
      return (
        <p className="mt-4 text-sm text-red-700 dark:text-red-300" role="alert">
          Não foi possível carregar as competências. {getContabilErrorMessage(competences.error)}
        </p>
      );
    }

    const records = competences.data ?? [];
    if (records.length === 0) {
      return (
        <p className="mt-4 rounded-lg border border-dashed border-gray-300 p-4 text-sm text-gray-600 dark:border-slate-700 dark:text-slate-400">
          Nenhuma competência para este cliente.
        </p>
      );
    }

    return (
      <ul className="mt-4 divide-y rounded-lg border border-gray-200 dark:divide-slate-800 dark:border-slate-700">
        {records.map((item) => (
          <li key={item.id} className="p-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium text-gray-900 dark:text-white">
                  {formatTriageCompetence(item.competence)}
                </p>
                <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-slate-400">
                  <span>Criada em {new Date(item.created_at).toLocaleDateString("pt-BR")}</span>
                  {item.archived_at ? (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      Arquivada em {new Date(item.archived_at).toLocaleDateString("pt-BR")} · somente
                      leitura
                    </span>
                  ) : null}
                </div>
              </div>
              {canEdit && item.archived_at ? (
                <button
                  type="button"
                  onClick={() => mutations.create.mutate(item.competence)}
                  disabled={mutations.create.isPending}
                  className="inline-flex items-center justify-center gap-2 self-start rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800 sm:self-auto"
                >
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  Restaurar
                </button>
              ) : null}
              {canEdit && !item.archived_at ? (
                <button
                  type="button"
                  onClick={() => archiveCompetence(item.id)}
                  disabled={mutations.archive.isPending}
                  className="inline-flex items-center justify-center gap-2 self-start rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800 sm:self-auto"
                >
                  <Archive className="h-4 w-4" aria-hidden="true" />
                  Arquivar
                </button>
              ) : null}
            </div>
            <TriageExternalLinksSection
              clientId={clientId}
              competence={item.competence}
              canEdit={canEdit && !item.archived_at}
            />
            <TriageUrgentRequestsSection
              clientId={clientId}
              competence={item.competence}
              canEdit={canEdit && !item.archived_at}
            />
            <TriageAuditTimeline competenceId={item.id} />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <section
      className="rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"
      aria-labelledby="triage-competences-title"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2
            id="triage-competences-title"
            className="text-lg font-semibold text-gray-900 dark:text-white"
          >
            Competências da Triagem
          </h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">
            Cada competência guarda a configuração e os responsáveis vigentes no início do ciclo.
          </p>
        </div>
        {canEdit ? (
          <form className="flex flex-col gap-2 sm:flex-row sm:items-end" onSubmit={createCompetence}>
            <label className="text-sm font-medium text-gray-700 dark:text-slate-300">
              Nova competência
              <input
                aria-label="Nova competência"
                type="month"
                required
                value={competence}
                onChange={(event) => setCompetence(event.target.value)}
                className="mt-1 block h-10 rounded-lg border border-gray-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-800"
              />
            </label>
            <button
              type="submit"
              disabled={mutations.create.isPending}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {mutations.create.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <CalendarPlus className="h-4 w-4" aria-hidden="true" />
              )}
              Criar competência
            </button>
          </form>
        ) : null}
      </div>

      {renderCompetenceContent()}

      {actionError ? (
        <p className="mt-3 text-sm text-red-700 dark:text-red-300" role="alert">
          Não foi possível concluir a alteração. {getContabilErrorMessage(actionError)}
        </p>
      ) : null}
    </section>
  );
}
