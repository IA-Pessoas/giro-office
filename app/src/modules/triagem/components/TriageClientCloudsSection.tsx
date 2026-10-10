import { useState } from "react";
import { ExternalLink } from "lucide-react";

import { getContabilErrorMessage } from "@modules/contabil";
import { useFetch } from "@shared/hooks";

import { triagemCloudService, type TriageClientCloud } from "../services/triagemCloudService";

type Draft = { type: string; link: string };

/**
 * Nuvens do cliente: vínculo do cliente, visível em todas as competências. Só referência
 * (tipo e link); os links externos de cada competência seguem na própria competência.
 */
export function TriageClientCloudsSection({
  clientId,
  canEdit,
}: {
  clientId: string;
  canEdit: boolean;
}) {
  const clouds = useFetch(["triagem", "clouds", clientId], () =>
    triagemCloudService.list(clientId),
  );
  const [draft, setDraft] = useState<Draft>({ type: "", link: "" });
  const [editing, setEditing] = useState<{ id: string } & Draft>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function run(action: () => Promise<unknown>, after: () => void) {
    setSaving(true);
    setError("");
    try {
      await action();
      after();
      await clouds.refetch();
    } catch (failure) {
      setError(getContabilErrorMessage(failure));
    } finally {
      setSaving(false);
    }
  }

  function startEdit(cloud: TriageClientCloud) {
    setEditing({ id: cloud.id, type: cloud.type, link: cloud.link });
  }

  return (
    <section
      aria-labelledby="triage-client-clouds-title"
      className="rounded-xl border border-gray-200 p-4 dark:border-slate-700"
    >
      <h3
        id="triage-client-clouds-title"
        className="font-semibold text-gray-900 dark:text-white"
      >
        Nuvens do cliente
      </h3>
      <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">
        Tipo e link da pasta do cliente, válidos em todas as competências. Não há envio de arquivos.
      </p>
      {clouds.isError ? (
        <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-300">
          {getContabilErrorMessage(clouds.error)}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      ) : null}
      <ul className="mt-3 space-y-2">
        {(clouds.data ?? []).map((cloud) =>
          editing?.id === cloud.id ? (
            <li key={cloud.id} className="grid gap-2 sm:grid-cols-[1fr_2fr_auto_auto] sm:items-end">
              <label className="text-xs text-gray-600 dark:text-slate-300">
                Tipo
                <input
                  aria-label={`Tipo da nuvem ${cloud.type}`}
                  value={editing.type}
                  maxLength={100}
                  onChange={(event) => setEditing({ ...editing, type: event.target.value })}
                  className="mt-1 block h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-800"
                />
              </label>
              <label className="text-xs text-gray-600 dark:text-slate-300">
                Link
                <input
                  aria-label={`Link da nuvem ${cloud.type}`}
                  type="url"
                  value={editing.link}
                  onChange={(event) => setEditing({ ...editing, link: event.target.value })}
                  className="mt-1 block h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-800"
                />
              </label>
              <button
                type="button"
                disabled={saving}
                onClick={() =>
                  void run(
                    () =>
                      triagemCloudService.update(cloud.id, {
                        type: editing.type,
                        link: editing.link,
                      }),
                    () => setEditing(undefined),
                  )
                }
                className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Salvar
              </button>
              <button
                type="button"
                onClick={() => setEditing(undefined)}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Cancelar
              </button>
            </li>
          ) : (
            <li key={cloud.id} className="flex flex-wrap items-center justify-between gap-2">
              <a
                href={cloud.link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:underline dark:text-blue-300"
              >
                <ExternalLink aria-hidden="true" className="h-4 w-4" />
                {cloud.type}
              </a>
              {canEdit ? (
                <button
                  type="button"
                  onClick={() => startEdit(cloud)}
                  className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Editar {cloud.type}
                </button>
              ) : null}
            </li>
          ),
        )}
        {clouds.data && clouds.data.length === 0 ? (
          <li className="text-sm text-gray-600 dark:text-slate-400">Nenhuma nuvem cadastrada.</li>
        ) : null}
      </ul>
      {canEdit ? (
        <form
          className="mt-3 grid gap-2 sm:grid-cols-[1fr_2fr_auto] sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            void run(
              () => triagemCloudService.create(clientId, draft),
              () => setDraft({ type: "", link: "" }),
            );
          }}
        >
          <label className="text-xs text-gray-600 dark:text-slate-300">
            Tipo
            <input
              aria-label="Tipo da nova nuvem"
              required
              maxLength={100}
              placeholder="Google Drive"
              value={draft.type}
              onChange={(event) => setDraft({ ...draft, type: event.target.value })}
              className="mt-1 block h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-800"
            />
          </label>
          <label className="text-xs text-gray-600 dark:text-slate-300">
            Link
            <input
              aria-label="Link da nova nuvem"
              type="url"
              required
              placeholder="https://"
              value={draft.link}
              onChange={(event) => setDraft({ ...draft, link: event.target.value })}
              className="mt-1 block h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-800"
            />
          </label>
          <button type="submit" disabled={saving} className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">
            Adicionar nuvem
          </button>
        </form>
      ) : null}
    </section>
  );
}
