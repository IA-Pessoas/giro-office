import { useState } from "react";
import { ExternalLink } from "lucide-react";

import { getContabilErrorMessage } from "@modules/contabil";

import { useTriageCloudMutations, useTriageClouds } from "../hooks/useTriageClouds";
import type { TriageClientCloudInput } from "../services/triagemCloudService";

// Linhas antigas de clientes.clouds não passaram pela validação de http(s) da API.
const SAFE_LINK = /^https?:\/\//iu;

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
  const clouds = useTriageClouds(clientId);
  const mutations = useTriageCloudMutations(clientId);
  const [draft, setDraft] = useState<TriageClientCloudInput>({ type: "", link: "" });
  const [editing, setEditing] = useState<{ id: string } & TriageClientCloudInput>();
  const saving = mutations.create.isPending || mutations.update.isPending;
  const failure = mutations.create.error ?? mutations.update.error ?? clouds.error;

  return (
    <section
      aria-labelledby="triage-client-clouds-title"
      className="rounded-xl border border-gray-200 p-4 dark:border-slate-700"
    >
      <h3 id="triage-client-clouds-title" className="font-semibold text-gray-900 dark:text-white">
        Nuvens do cliente
      </h3>
      <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">
        Tipo e link da pasta do cliente, válidos em todas as competências. Não há envio de arquivos.
      </p>
      {failure ? (
        <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-300">
          {getContabilErrorMessage(failure)}
        </p>
      ) : null}
      <ul className="mt-3 space-y-2">
        {(clouds.data ?? []).map((cloud) =>
          editing?.id === cloud.id ? (
            <li key={cloud.id}>
              <form
                className="grid gap-2 sm:grid-cols-[1fr_2fr_auto_auto] sm:items-end"
                onSubmit={(event) => {
                  event.preventDefault();
                  mutations.update.mutate(
                    { id: cloud.id, input: { type: editing.type, link: editing.link } },
                    { onSuccess: () => setEditing(undefined) },
                  );
                }}
              >
                <CloudFields
                  label="da nuvem em edição"
                  value={editing}
                  onChange={(value) => setEditing({ ...editing, ...value })}
                />
                <button type="submit" disabled={saving} className={ACTION}>
                  Salvar
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setEditing(undefined)}
                  className={ACTION}
                >
                  Cancelar
                </button>
              </form>
            </li>
          ) : (
            <li key={cloud.id} className="flex flex-wrap items-center justify-between gap-2">
              {SAFE_LINK.test(cloud.link) ? (
                <a
                  href={cloud.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:underline dark:text-blue-300"
                >
                  <ExternalLink aria-hidden="true" className="h-4 w-4" />
                  {cloud.type}
                </a>
              ) : (
                <span className="text-sm text-gray-700 dark:text-slate-300">
                  {cloud.type}: {cloud.link}
                </span>
              )}
              {canEdit ? (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setEditing({ id: cloud.id, type: cloud.type, link: cloud.link })}
                  className={ACTION}
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
            mutations.create.mutate(draft, { onSuccess: () => setDraft({ type: "", link: "" }) });
          }}
        >
          <CloudFields label="da nova nuvem" value={draft} onChange={setDraft} />
          <button type="submit" disabled={saving} className={ACTION}>
            Adicionar nuvem
          </button>
        </form>
      ) : null}
    </section>
  );
}

// ponytail: classes repetidas só neste arquivo; extrair para o módulo se outra tela usar.
const ACTION =
  "inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800";
const FIELD =
  "mt-1 block h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-800";

function CloudFields({
  label,
  value,
  onChange,
}: {
  label: string;
  value: TriageClientCloudInput;
  onChange: (value: TriageClientCloudInput) => void;
}) {
  return (
    <>
      <label className="text-xs text-gray-600 dark:text-slate-300">
        Tipo
        <input
          aria-label={`Tipo ${label}`}
          required
          maxLength={100}
          placeholder="Google Drive"
          value={value.type}
          onChange={(event) => onChange({ ...value, type: event.target.value })}
          className={FIELD}
        />
      </label>
      <label className="text-xs text-gray-600 dark:text-slate-300">
        Link
        <input
          aria-label={`Link ${label}`}
          type="url"
          required
          placeholder="https://"
          value={value.link}
          onChange={(event) => onChange({ ...value, link: event.target.value })}
          className={FIELD}
        />
      </label>
    </>
  );
}
