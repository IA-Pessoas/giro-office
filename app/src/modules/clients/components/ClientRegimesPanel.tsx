import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { clientTextFieldClassName } from "../form/clientFormControls";
import { CLIENT_REGIMES_QUERY_KEY, useClientRegimes } from "../hooks/useClients";
import { clientService } from "../services/clientService";

interface ClientRegimesPanelProps {
  canEdit: boolean;
}

function apiErrorMessage(error: unknown, fallback: string): string {
  const message = (error as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
  return typeof message === "string" && message ? message : fallback;
}

// Catálogo de regimes da organização (tb_regularize.regimes no legado, #1740).
export function ClientRegimesPanel({ canEdit }: ClientRegimesPanelProps) {
  const queryClient = useQueryClient();
  const regimesQuery = useClientRegimes();
  const regimes = regimesQuery.data ?? [];
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState("");
  const [editingName, setEditingName] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const editing = regimes.find((regime) => regime.id === editingId);

  async function save(action: () => Promise<unknown>, fallback: string) {
    setIsSaving(true);
    setError("");
    try {
      await action();
      await queryClient.invalidateQueries({ queryKey: CLIENT_REGIMES_QUERY_KEY });
      return true;
    } catch (caught) {
      setError(apiErrorMessage(caught, fallback));
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  async function createRegime() {
    if (!canEdit || !newName.trim()) return;
    const saved = await save(
      () => clientService.createRegime(newName.trim()),
      "Não foi possível cadastrar o regime. Confira o nome e tente novamente.",
    );
    if (saved) setNewName("");
  }

  async function renameRegime() {
    if (!canEdit || !editing || !editingName.trim()) return;
    const saved = await save(
      () => clientService.updateRegime(editing.id, editingName.trim()),
      "Não foi possível renomear o regime. Confira o nome e tente novamente.",
    );
    if (saved) setEditingId("");
  }

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Regimes</h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Regimes da organização disponíveis na ficha do cliente. Renomear não altera clientes já
          cadastrados.
        </p>
      </div>

      {canEdit ? (
        <form
          className="mt-5 flex flex-col gap-3 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            void createRegime();
          }}
        >
          <label className="flex-1 text-sm font-medium text-slate-700 dark:text-slate-200">
            Novo regime
            <input
              className={`${clientTextFieldClassName} mt-1.5`}
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              maxLength={80}
              placeholder="Nome do regime"
              disabled={isSaving}
            />
          </label>
          <button
            type="submit"
            disabled={isSaving || !newName.trim()}
            className="self-end rounded-xl bg-gradient-to-r from-[var(--colors-brand-gradient-start)] to-[var(--colors-brand-gradient-end)] px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cadastrar regime
          </button>
        </form>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:bg-rose-950/40 dark:text-rose-200"
        >
          {error}
        </p>
      ) : null}

      <div className="mt-5">
        {regimesQuery.isLoading ? (
          <p
            role="status"
            className="rounded-xl bg-slate-50 px-3 py-4 text-sm text-slate-500 dark:bg-slate-950/40 dark:text-slate-400"
          >
            Carregando regimes…
          </p>
        ) : regimesQuery.error ? (
          <p
            role="alert"
            className="rounded-xl bg-rose-50 px-3 py-4 text-sm text-rose-800 dark:bg-rose-950/40 dark:text-rose-200"
          >
            Não foi possível carregar os regimes. Tente novamente.
          </p>
        ) : regimes.length ? (
          <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
            {regimes.map((regime) => (
              <li key={regime.id} className="flex flex-col gap-2 px-3 py-3 text-sm sm:flex-row sm:items-center">
                {editingId === regime.id ? (
                  <form
                    className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void renameRegime();
                    }}
                  >
                    <input
                      aria-label={`Novo nome de ${regime.name}`}
                      className={clientTextFieldClassName}
                      value={editingName}
                      onChange={(event) => setEditingName(event.target.value)}
                      maxLength={80}
                      disabled={isSaving}
                    />
                    <button
                      type="submit"
                      disabled={isSaving || !editingName.trim() || editingName.trim() === regime.name}
                      className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      Salvar
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId("")}
                      disabled={isSaving}
                      className="rounded-xl px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      Cancelar
                    </button>
                  </form>
                ) : (
                  <>
                    <span className="flex-1 font-medium text-slate-800 dark:text-slate-100">
                      {regime.name}
                    </span>
                    {canEdit ? (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(regime.id);
                          setEditingName(regime.name);
                          setError("");
                        }}
                        disabled={isSaving}
                        className="self-start rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        Renomear
                      </button>
                    ) : null}
                  </>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl bg-slate-50 px-3 py-4 text-sm text-slate-600 dark:bg-slate-950/40 dark:text-slate-400">
            Nenhum regime cadastrado. A ficha oferece Simples Nacional, Lucro Presumido e Lucro Real.
          </p>
        )}
      </div>
    </section>
  );
}
