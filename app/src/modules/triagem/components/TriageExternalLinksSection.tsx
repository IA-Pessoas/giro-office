import { useState, type FormEvent } from "react";
import { Archive, ExternalLink, Loader2, Pencil, Plus, Save, X } from "lucide-react";

import { getContabilErrorMessage } from "@modules/contabil";
import { useAssignableUsers } from "@modules/rh";

import {
  useTriageCatalogs,
  useTriageExternalLinkMutations,
  useTriageExternalLinks,
} from "../hooks";
import type {
  TriageCatalogItem,
  TriageExternalLink,
  TriageExternalLinkInput,
  TriageExternalLinkType,
} from "../services";

type LinkFormValues = TriageExternalLinkInput & { description: string; responsible_id: string };

const EMPTY_FORM: LinkFormValues = {
  type: "",
  url: "",
  description: "",
  responsible_id: "",
};

const BUTTON_CLASSNAME =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800";
const PRIMARY_BUTTON_CLASSNAME =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60";

function toInputValues(link: TriageExternalLink): LinkFormValues {
  return {
    type: link.type,
    url: link.url,
    description: link.description ?? "",
    responsible_id: link.responsible_id ?? "",
  };
}

function toPayload(values: LinkFormValues): TriageExternalLinkInput {
  return {
    type: values.type,
    url: values.url.trim(),
    description: values.description.trim() || null,
    responsible_id: values.responsible_id || null,
  };
}

function linkTypeOptions(
  catalogItems: TriageCatalogItem[] | undefined,
): Array<{ value: TriageExternalLinkType; label: string }> {
  return (catalogItems ?? []).map((item) => ({ value: item.code, label: item.label }));
}

function typeLabel(type: TriageExternalLinkType, catalogItems: TriageCatalogItem[] | undefined): string {
  return catalogItems?.find((item) => item.code === type)?.label ?? type;
}

function LinkFormFields({
  values,
  users,
  linkTypes,
  onChange,
}: {
  values: LinkFormValues;
  users: Array<{ id: string; name: string }>;
  linkTypes: Array<{ value: TriageExternalLinkType; label: string }>;
  onChange: <K extends keyof LinkFormValues>(field: K, value: LinkFormValues[K]) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="text-sm font-medium text-gray-700 dark:text-slate-300">
        Tipo
        <select
          aria-label="Tipo do link externo"
          required
          value={values.type}
          onChange={(event) => onChange("type", event.target.value as TriageExternalLinkType)}
          className="mt-1 block h-10 w-full rounded-lg border border-gray-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-800"
        >
          <option value="">Selecione um tipo cadastrado</option>
          {linkTypes.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm font-medium text-gray-700 dark:text-slate-300 sm:col-span-2">
        Link HTTPS
        <input
          aria-label="Link HTTPS"
          required
          type="url"
          pattern="https://.*"
          value={values.url}
          onChange={(event) => onChange("url", event.target.value)}
          placeholder="https://..."
          className="mt-1 block h-10 w-full rounded-lg border border-gray-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-800"
        />
      </label>
      <label className="text-sm font-medium text-gray-700 dark:text-slate-300">
        Responsável
        <select
          aria-label="Responsável do link externo"
          value={values.responsible_id}
          onChange={(event) => onChange("responsible_id", event.target.value)}
          className="mt-1 block h-10 w-full rounded-lg border border-gray-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-800"
        >
          <option value="">Sem responsável</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm font-medium text-gray-700 dark:text-slate-300 sm:col-span-2 lg:col-span-4">
        Descrição
        <input
          aria-label="Descrição do link externo"
          maxLength={500}
          value={values.description}
          onChange={(event) => onChange("description", event.target.value)}
          className="mt-1 block h-10 w-full rounded-lg border border-gray-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-800"
        />
      </label>
    </div>
  );
}

export function TriageExternalLinksSection({
  clientId,
  competence,
  canEdit,
}: {
  clientId: string;
  competence: string;
  canEdit: boolean;
}) {
  const linksQuery = useTriageExternalLinks(clientId, competence);
  const linkTypesQuery = useTriageCatalogs("LINK_TYPE");
  const mutations = useTriageExternalLinkMutations(clientId, competence);
  const usersQuery = useAssignableUsers({ enabled: canEdit, module: "triagem" });
  const [createValues, setCreateValues] = useState<LinkFormValues>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<LinkFormValues>(EMPTY_FORM);
  const users = (usersQuery.data ?? []).map((user) => ({ id: user.id, name: user.name }));
  const createLinkTypes = linkTypeOptions(linkTypesQuery.data);
  const actionError =
    linksQuery.error ??
    linkTypesQuery.error ??
    usersQuery.error ??
    mutations.create.error ??
    mutations.update.error ??
    mutations.archive.error;
  const isMutating =
    mutations.create.isPending || mutations.update.isPending || mutations.archive.isPending;

  function updateCreateValue<K extends keyof LinkFormValues>(
    field: K,
    value: LinkFormValues[K],
  ): void {
    setCreateValues((current) => ({ ...current, [field]: value }));
  }

  function updateEditValue<K extends keyof LinkFormValues>(
    field: K,
    value: LinkFormValues[K],
  ): void {
    setEditValues((current) => ({ ...current, [field]: value }));
  }

  async function createLink(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await mutations.create.mutateAsync(toPayload(createValues));
    setCreateValues(EMPTY_FORM);
  }

  async function updateLink(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!editingId) return;
    await mutations.update.mutateAsync({ id: editingId, input: toPayload(editValues) });
    setEditingId(null);
  }

  function startEditing(link: TriageExternalLink): void {
    setEditingId(link.id);
    setEditValues(toInputValues(link));
  }

  function archiveLink(id: string): void {
    if (window.confirm("Arquivar este link externo?")) {
      mutations.archive.mutate(id);
    }
  }

  if (linksQuery.isLoading) {
    return (
      <p className="mt-3 flex items-center gap-2 text-sm text-slate-500" role="status">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Carregando links externos...
      </p>
    );
  }

  const links = linksQuery.data ?? [];

  return (
    <div className="mt-3 rounded-lg border border-dashed border-gray-300 p-3 dark:border-slate-700">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-800 dark:text-slate-100">
            Links externos
          </h3>
          <p className="text-xs text-gray-500 dark:text-slate-400">
            Competência {competence}; apenas referências HTTPS, sem upload ou sincronização.
          </p>
        </div>
      </div>

      {canEdit ? (
        <form className="mt-3 space-y-3" onSubmit={createLink}>
          <LinkFormFields
            values={createValues}
            users={users}
            linkTypes={createLinkTypes}
            onChange={updateCreateValue}
          />
          <button type="submit" disabled={isMutating} className={PRIMARY_BUTTON_CLASSNAME}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Adicionar link
          </button>
        </form>
      ) : null}

      {links.length === 0 ? (
        <p className="mt-3 rounded-lg bg-gray-50 p-3 text-sm text-gray-600 dark:bg-slate-800/60 dark:text-slate-400">
          Nenhum link externo registrado para esta competência.
        </p>
      ) : (
        <ul className="mt-3 space-y-2" aria-label={`Links externos da competência ${competence}`}>
          {links.map((link) => (
            <li key={link.id} className="rounded-lg border border-gray-200 p-3 dark:border-slate-700">
              {editingId === link.id ? (
                <form className="space-y-3" onSubmit={updateLink}>
                  <LinkFormFields
                    values={editValues}
                    users={users}
                    linkTypes={linkTypeOptions(linkTypesQuery.data)}
                    onChange={updateEditValue}
                  />
                  <div className="flex flex-wrap gap-2">
                    <button type="submit" disabled={isMutating} className={PRIMARY_BUTTON_CLASSNAME}>
                      <Save className="h-4 w-4" aria-hidden="true" />
                      Salvar revisão
                    </button>
                    <button type="button" className={BUTTON_CLASSNAME} onClick={() => setEditingId(null)}>
                      <X className="h-4 w-4" aria-hidden="true" />
                      Cancelar
                    </button>
                  </div>
                </form>
              ) : (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex max-w-full items-center gap-2 break-all text-sm font-medium text-blue-700 underline underline-offset-2 dark:text-blue-300"
                    >
                      <ExternalLink className="h-4 w-4 shrink-0" aria-hidden="true" />
                      {link.url}
                    </a>
                    <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                      {typeLabel(link.type, linkTypesQuery.data)} · {link.description || "Sem descrição"} · {link.responsible?.name || "Sem responsável"}
                    </p>
                  </div>
                  {canEdit ? (
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <button type="button" className={BUTTON_CLASSNAME} onClick={() => startEditing(link)}>
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                        Revisar
                      </button>
                      <button
                        type="button"
                        className={BUTTON_CLASSNAME}
                        onClick={() => archiveLink(link.id)}
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
    </div>
  );
}
