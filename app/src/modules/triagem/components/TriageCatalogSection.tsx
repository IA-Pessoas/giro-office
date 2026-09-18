import { useState, type FormEvent } from "react";
import { Archive, Loader2, Pencil, Plus, Save, X } from "lucide-react";

import { getContabilErrorMessage } from "@modules/contabil";

import { useTriageCatalogMutations, useTriageCatalogs } from "../hooks";
import type { TriageCatalogInput, TriageCatalogItem, TriageCatalogKind } from "../services";

const CATALOG_KINDS: Array<{ value: TriageCatalogKind; label: string }> = [
  { value: "JUSTIFICATION", label: "Justificativas" },
  { value: "LINK_TYPE", label: "Tipos de link" },
  { value: "STATE_SITE", label: "Sites estaduais" },
];

type CatalogFormValues = {
  kind: TriageCatalogKind;
  code: string;
  label: string;
  url: string;
};

const EMPTY_FORM: CatalogFormValues = {
  kind: "JUSTIFICATION",
  code: "",
  label: "",
  url: "",
};

const BUTTON_CLASSNAME =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800";
const PRIMARY_BUTTON_CLASSNAME =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60";

function toInputValues(item: TriageCatalogItem): CatalogFormValues {
  return { kind: item.kind, code: item.code, label: item.label, url: item.url ?? "" };
}

function toPayload(values: CatalogFormValues, clearUrl = false): TriageCatalogInput {
  const url = values.url.trim();
  return {
    kind: values.kind,
    code: values.code.trim(),
    label: values.label.trim(),
    ...(url ? { url } : clearUrl ? { url: null } : {}),
  };
}

function CatalogFormFields({
  values,
  onChange,
}: {
  values: CatalogFormValues;
  onChange: <K extends keyof CatalogFormValues>(field: K, value: CatalogFormValues[K]) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="text-sm font-medium text-gray-700 dark:text-slate-300">
        Tipo
        <select
          aria-label="Tipo do catálogo"
          value={values.kind}
          onChange={(event) => onChange("kind", event.target.value as TriageCatalogKind)}
          className="mt-1 block h-10 w-full rounded-lg border border-gray-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-800"
        >
          {CATALOG_KINDS.map((kind) => (
            <option key={kind.value} value={kind.value}>
              {kind.label}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm font-medium text-gray-700 dark:text-slate-300">
        Código
        <input
          aria-label="Código do catálogo"
          required
          maxLength={100}
          value={values.code}
          onChange={(event) => onChange("code", event.target.value)}
          className="mt-1 block h-10 w-full rounded-lg border border-gray-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-800"
        />
      </label>
      <label className="text-sm font-medium text-gray-700 dark:text-slate-300 sm:col-span-2">
        Rótulo
        <input
          aria-label="Rótulo do catálogo"
          required
          maxLength={255}
          value={values.label}
          onChange={(event) => onChange("label", event.target.value)}
          className="mt-1 block h-10 w-full rounded-lg border border-gray-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-800"
        />
      </label>
      <label className="text-sm font-medium text-gray-700 dark:text-slate-300 sm:col-span-2 lg:col-span-4">
        URL HTTPS (opcional)
        <input
          aria-label="URL HTTPS do catálogo"
          type="url"
          pattern="https://.*"
          value={values.url}
          onChange={(event) => onChange("url", event.target.value)}
          className="mt-1 block h-10 w-full rounded-lg border border-gray-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-800"
        />
      </label>
    </div>
  );
}

export function TriageCatalogSection({ canEdit }: { canEdit: boolean }) {
  const [kind, setKind] = useState<TriageCatalogKind>("JUSTIFICATION");
  const catalogs = useTriageCatalogs(kind);
  const mutations = useTriageCatalogMutations();
  const [createValues, setCreateValues] = useState<CatalogFormValues>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<CatalogFormValues>(EMPTY_FORM);
  const actionError =
    catalogs.error ?? mutations.create.error ?? mutations.update.error ?? mutations.archive.error;
  const isMutating =
    mutations.create.isPending || mutations.update.isPending || mutations.archive.isPending;

  function updateCreateValue<K extends keyof CatalogFormValues>(
    field: K,
    value: CatalogFormValues[K],
  ): void {
    setCreateValues((current) => ({ ...current, [field]: value }));
  }

  function updateEditValue<K extends keyof CatalogFormValues>(
    field: K,
    value: CatalogFormValues[K],
  ): void {
    setEditValues((current) => ({ ...current, [field]: value }));
  }

  async function createCatalog(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await mutations.create.mutateAsync(toPayload({ ...createValues, kind }));
    setCreateValues({ ...EMPTY_FORM, kind });
  }

  async function updateCatalog(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!editingId) return;
    await mutations.update.mutateAsync({ id: editingId, input: toPayload(editValues, true) });
    setEditingId(null);
  }

  function archiveCatalog(id: string): void {
    if (window.confirm("Arquivar este item de catálogo?")) {
      mutations.archive.mutate(id);
    }
  }

  return (
    <section
      className="rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"
      aria-labelledby="triage-catalogs-title"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="triage-catalogs-title" className="text-lg font-semibold text-gray-900 dark:text-white">
            Catálogos operacionais
          </h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">
            Justificativas, tipos de link e sites estaduais controlados por organização.
          </p>
        </div>
        <label className="text-sm font-medium text-gray-700 dark:text-slate-300">
          Catálogo
          <select
            aria-label="Filtrar catálogo operacional"
            value={kind}
            onChange={(event) => setKind(event.target.value as TriageCatalogKind)}
            className="mt-1 block h-10 rounded-lg border border-gray-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-800"
          >
            {CATALOG_KINDS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {canEdit ? (
        <form className="mt-4 space-y-3" onSubmit={createCatalog}>
          <CatalogFormFields values={{ ...createValues, kind }} onChange={updateCreateValue} />
          <button type="submit" disabled={isMutating} className={PRIMARY_BUTTON_CLASSNAME}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Adicionar item
          </button>
        </form>
      ) : null}

      {catalogs.isLoading ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-slate-500" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Carregando catálogo...
        </p>
      ) : catalogs.isError ? (
        <p className="mt-4 text-sm text-red-700 dark:text-red-300" role="alert">
          Não foi possível carregar o catálogo. {getContabilErrorMessage(catalogs.error)}
        </p>
      ) : (catalogs.data ?? []).length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-gray-300 p-4 text-sm text-gray-600 dark:border-slate-700 dark:text-slate-400">
          Nenhum item ativo neste catálogo.
        </p>
      ) : (
        <ul className="mt-4 divide-y rounded-lg border border-gray-200 dark:divide-slate-800 dark:border-slate-700">
          {(catalogs.data ?? []).map((item) => (
            <li key={item.id} className="p-3">
              {editingId === item.id ? (
                <form className="space-y-3" onSubmit={updateCatalog}>
                  <CatalogFormFields values={editValues} onChange={updateEditValue} />
                  <div className="flex flex-wrap gap-2">
                    <button type="submit" disabled={isMutating} className={PRIMARY_BUTTON_CLASSNAME}>
                      <Save className="h-4 w-4" aria-hidden="true" />
                      Salvar
                    </button>
                    <button
                      type="button"
                      className={BUTTON_CLASSNAME}
                      onClick={() => setEditingId(null)}
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                      Cancelar
                    </button>
                  </div>
                </form>
              ) : (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {item.label} <span className="text-xs text-gray-500">({item.code})</span>
                    </p>
                    {item.url ? (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-700 underline dark:text-blue-300"
                      >
                        {item.url}
                      </a>
                    ) : null}
                  </div>
                  {canEdit ? (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={BUTTON_CLASSNAME}
                        onClick={() => {
                          setEditingId(item.id);
                          setEditValues(toInputValues(item));
                        }}
                      >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                        Editar
                      </button>
                      <button
                        type="button"
                        className={BUTTON_CLASSNAME}
                        onClick={() => archiveCatalog(item.id)}
                        disabled={isMutating}
                      >
                        <Archive className="h-4 w-4" aria-hidden="true" />
                        Arquivar
                      </button>
                    </div>
                  ) : null}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {actionError ? (
        <p className="mt-3 text-sm text-red-700 dark:text-red-300" role="alert">
          Não foi possível concluir a alteração. {getContabilErrorMessage(actionError)}
        </p>
      ) : null}
    </section>
  );
}
