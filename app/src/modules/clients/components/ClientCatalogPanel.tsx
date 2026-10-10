import { useQueryClient } from "@tanstack/react-query";
import {
  CLIENT_SEGMENT_TYPE_LABELS,
  CLIENT_SEGMENT_TYPES,
  type ClientSegmentType,
} from "@workspace/shared/regularize";
import { useState } from "react";

import { ClientNativeSelect } from "../form/ClientNativeSelect";
import {
  clientPrimaryButtonClassName as primaryButtonClassName,
  clientSecondaryButtonClassName as secondaryButtonClassName,
  clientTextFieldClassName,
} from "../form/clientFormControls";
import {
  CLIENT_REGIMES_QUERY_KEY,
  CLIENT_SEGMENTS_QUERY_KEY,
  useClientRegimes,
  useClientSegments,
} from "../hooks/useClients";
import { clientService } from "../services/clientService";
import { ClientListState, clientListClassName } from "./ClientListState";

type CatalogKind = "regime" | "segment";

interface CatalogItem {
  id: string;
  name: string;
  type?: ClientSegmentType;
}

interface ClientCatalogPanelProps {
  kind: CatalogKind;
  canEdit: boolean;
}

type CatalogWrite = { name: string; type: ClientSegmentType };

// Catálogos da ficha (tb_regularize.regimes e tb_integracao.segmentos no legado, #1740 e #1741).
const CATALOGS = {
  regime: {
    useItems: useClientRegimes,
    queryKey: CLIENT_REGIMES_QUERY_KEY,
    hasType: false,
    create: ({ name }: CatalogWrite) => clientService.createRegime(name),
    update: (id: string, { name }: CatalogWrite) => clientService.updateRegime(id, name),
    title: "Regimes",
    description:
      "Regimes da organização disponíveis na ficha do cliente. Renomear não altera clientes já cadastrados.",
    newLabel: "Novo regime",
    createLabel: "Cadastrar regime",
    loading: "Carregando regimes…",
    loadError: "Não foi possível carregar os regimes. Tente novamente.",
    empty:
      "Nenhum regime cadastrado. A ficha oferece Simples Nacional, Lucro Presumido e Lucro Real.",
    saveError: "Não foi possível salvar o regime. Confira o nome e tente novamente.",
  },
  segment: {
    useItems: useClientSegments,
    queryKey: CLIENT_SEGMENTS_QUERY_KEY,
    hasType: true,
    create: (input: CatalogWrite) => clientService.createSegment(input),
    update: (id: string, input: CatalogWrite) => clientService.updateSegment(id, input),
    title: "Segmentos",
    description:
      "Segmentos de serviço, comércio e indústria usados na ficha e no Regularize. Renomear não altera clientes já cadastrados.",
    newLabel: "Novo segmento",
    createLabel: "Cadastrar segmento",
    loading: "Carregando segmentos…",
    loadError: "Não foi possível carregar os segmentos. Tente novamente.",
    empty: "Nenhum segmento cadastrado. Cadastre um para selecioná-lo na ficha do cliente.",
    saveError: "Não foi possível salvar o segmento. Confira o nome e tente novamente.",
  },
} as const;

const DEFAULT_SEGMENT_TYPE: ClientSegmentType = CLIENT_SEGMENT_TYPES[0];

function apiErrorMessage(error: unknown, fallback: string): string {
  const message = (error as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
  return typeof message === "string" && message ? message : fallback;
}

function SegmentTypeSelect({
  value,
  onChange,
  disabled,
  label,
}: {
  value: ClientSegmentType;
  onChange: (value: ClientSegmentType) => void;
  disabled: boolean;
  label: string;
}) {
  return (
    <ClientNativeSelect
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value as ClientSegmentType)}
      disabled={disabled}
    >
      {CLIENT_SEGMENT_TYPES.map((type) => (
        <option key={type} value={type}>
          {CLIENT_SEGMENT_TYPE_LABELS[type]}
        </option>
      ))}
    </ClientNativeSelect>
  );
}

export function ClientCatalogPanel({ kind, canEdit }: ClientCatalogPanelProps) {
  // `kind` não muda durante a vida do painel, então o hook escolhido é sempre o mesmo.
  const catalog = CATALOGS[kind];
  const queryClient = useQueryClient();
  const query = catalog.useItems();
  const items: CatalogItem[] = query.data ?? [];
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState(DEFAULT_SEGMENT_TYPE);
  const [editingId, setEditingId] = useState("");
  const [editingName, setEditingName] = useState("");
  const [editingType, setEditingType] = useState(DEFAULT_SEGMENT_TYPE);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const editing = items.find((item) => item.id === editingId);

  async function save(action: () => Promise<unknown>) {
    setIsSaving(true);
    setError("");
    try {
      await action();
      await queryClient.invalidateQueries({ queryKey: catalog.queryKey });
      return true;
    } catch (caught) {
      setError(apiErrorMessage(caught, catalog.saveError));
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  async function createItem() {
    const name = newName.trim();
    if (!canEdit || !name) return;
    const saved = await save(() => catalog.create({ name, type: newType }));
    if (saved) setNewName("");
  }

  async function updateItem() {
    const name = editingName.trim();
    if (!canEdit || !editing || !name) return;
    const saved = await save(() => catalog.update(editing.id, { name, type: editingType }));
    if (saved) setEditingId("");
  }

  const unchanged =
    !editing ||
    (editingName.trim() === editing.name && (!catalog.hasType || editingType === editing.type));

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{catalog.title}</h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">{catalog.description}</p>
      </div>

      {canEdit ? (
        <form
          className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            void createItem();
          }}
        >
          <label className="flex-1 text-sm font-medium text-slate-700 dark:text-slate-200">
            {catalog.newLabel}
            <input
              className={`${clientTextFieldClassName} mt-1.5`}
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              maxLength={80}
              placeholder="Nome"
              disabled={isSaving}
            />
          </label>
          {catalog.hasType ? (
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Tipo
              <div className="mt-1.5">
                <SegmentTypeSelect
                  label="Tipo do novo segmento"
                  value={newType}
                  onChange={setNewType}
                  disabled={isSaving}
                />
              </div>
            </label>
          ) : null}
          <button
            type="submit"
            disabled={isSaving || !newName.trim()}
            className={primaryButtonClassName}
          >
            {catalog.createLabel}
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
        <ClientListState
          query={query}
          isEmpty={!items.length}
          loading={catalog.loading}
          error={catalog.loadError}
          empty={catalog.empty}
        >
          <ul className={clientListClassName}>
            {items.map((item) => (
              <li
                key={item.id}
                className="flex flex-col gap-2 px-3 py-3 text-sm sm:flex-row sm:items-center"
              >
                {editingId === item.id ? (
                  <form
                    className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void updateItem();
                    }}
                  >
                    <input
                      aria-label={`Novo nome de ${item.name}`}
                      className={clientTextFieldClassName}
                      value={editingName}
                      onChange={(event) => setEditingName(event.target.value)}
                      maxLength={80}
                      disabled={isSaving}
                    />
                    {catalog.hasType ? (
                      <SegmentTypeSelect
                        label={`Tipo de ${item.name}`}
                        value={editingType}
                        onChange={setEditingType}
                        disabled={isSaving}
                      />
                    ) : null}
                    <button
                      type="submit"
                      disabled={isSaving || !editingName.trim() || unchanged}
                      className={`${secondaryButtonClassName} px-4 py-2 text-sm`}
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
                      {item.name}
                      {item.type ? (
                        <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {CLIENT_SEGMENT_TYPE_LABELS[item.type]}
                        </span>
                      ) : null}
                    </span>
                    {canEdit ? (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(item.id);
                          setEditingName(item.name);
                          setEditingType(item.type ?? DEFAULT_SEGMENT_TYPE);
                          setError("");
                        }}
                        disabled={isSaving}
                        className={`${secondaryButtonClassName} self-start px-3 py-1.5 text-xs`}
                      >
                        Editar
                      </button>
                    ) : null}
                  </>
                )}
              </li>
            ))}
          </ul>
        </ClientListState>
      </div>
    </section>
  );
}
