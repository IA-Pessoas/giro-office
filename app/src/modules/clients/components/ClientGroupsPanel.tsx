import { useQueryClient } from "@tanstack/react-query";
import { useDeferredValue, useMemo, useState } from "react";

import { clientService } from "../services/clientService";
import type { ClientGroup } from "../types";
import { CLIENT_GROUPS_QUERY_KEY, useClientGroups, useClients } from "../hooks/useClients";
import { ClientNativeSelect } from "../form/ClientNativeSelect";
import {
  clientPrimaryButtonClassName,
  clientSecondaryButtonClassName,
  clientTextFieldClassName,
} from "../form/clientFormControls";
import { ClientListState, clientListClassName } from "./ClientListState";

const secondaryButtonClassName = `${clientSecondaryButtonClassName} px-4 py-2.5 text-sm`;

interface ClientGroupsPanelProps {
  canEdit: boolean;
}

export function ClientGroupsPanel({ canEdit }: ClientGroupsPanelProps) {
  const queryClient = useQueryClient();
  const groupsQuery = useClientGroups();
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const allGroups = groupsQuery.data ?? [];
  const groups = allGroups.filter(
    (group) => statusFilter === "all" || group.status === (statusFilter === "active"),
  );
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);
  const [groupName, setGroupName] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const deferredSearch = useDeferredValue(search.trim());
  const clientsQuery = useClients({
    search: deferredSearch || undefined,
    ref: "integracao",
    page: 1,
    limit: 100,
    legacyIntegrationStatusFilter: false,
  });
  const selectedGroup = allGroups.find((group) => group.id === selectedGroupId);
  const selectedMemberSet = useMemo(() => new Set(selectedClientIds), [selectedClientIds]);

  function selectGroup(group: ClientGroup) {
    setSelectedGroupId(group.id);
    setGroupName(group.name);
    setSelectedClientIds(group.clients.map((client) => client.id));
    setError("");
  }

  async function createGroup() {
    if (!canEdit || !newGroupName.trim()) return;
    setIsSaving(true);
    setError("");
    try {
      const group = await clientService.createGroup(newGroupName.trim());
      selectGroup(group);
      setNewGroupName("");
      await queryClient.invalidateQueries({ queryKey: CLIENT_GROUPS_QUERY_KEY });
    } catch {
      setError("Não foi possível criar o grupo. Confira o nome e tente novamente.");
    } finally {
      setIsSaving(false);
    }
  }

  async function saveGroupName() {
    if (!canEdit || !selectedGroup || !groupName.trim()) return;
    setIsSaving(true);
    setError("");
    try {
      await clientService.updateGroup(selectedGroup.id, { name: groupName.trim() });
      await queryClient.invalidateQueries({ queryKey: CLIENT_GROUPS_QUERY_KEY });
    } catch {
      setError("Não foi possível renomear o grupo. Confira o nome e tente novamente.");
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleStatus() {
    if (!canEdit || !selectedGroup) return;
    setIsSaving(true);
    setError("");
    try {
      await clientService.updateGroup(selectedGroup.id, { status: !selectedGroup.status });
      await queryClient.invalidateQueries({ queryKey: CLIENT_GROUPS_QUERY_KEY });
    } catch {
      setError("Não foi possível alterar o status do grupo. Tente novamente.");
    } finally {
      setIsSaving(false);
    }
  }

  async function saveClients() {
    if (!canEdit || !selectedGroup) return;
    setIsSaving(true);
    setError("");
    try {
      await clientService.replaceGroupClients(selectedGroup.id, selectedClientIds);
      await queryClient.invalidateQueries({ queryKey: CLIENT_GROUPS_QUERY_KEY });
    } catch {
      setError("Não foi possível salvar as empresas do grupo. Atualize a lista e tente novamente.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Grupos de empresas</h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Organize clientes em grupos e mantenha os vínculos para consulta nos relatórios.
        </p>
      </div>

      {canEdit ? (
        <form
          className="mt-5 flex flex-col gap-3 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            void createGroup();
          }}
        >
          <label className="flex-1 text-sm font-medium text-slate-700 dark:text-slate-200">
            Novo grupo
            <input
              className={`${clientTextFieldClassName} mt-1.5`}
              value={newGroupName}
              onChange={(event) => setNewGroupName(event.target.value)}
              maxLength={120}
              placeholder="Nome do grupo"
              disabled={isSaving}
            />
          </label>
          <button
            type="submit"
            disabled={isSaving || !newGroupName.trim()}
            className={`self-end ${clientPrimaryButtonClassName}`}
          >
            Criar grupo
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

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(15rem,0.8fr)_minmax(0,1.2fr)]">
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Grupos cadastrados
            </h3>
            <ClientNativeSelect
              aria-label="Filtrar grupos por status"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
            >
              <option value="all">Todos</option>
              <option value="active">Ativos</option>
              <option value="inactive">Inativos</option>
            </ClientNativeSelect>
          </div>
          <ClientListState
            query={groupsQuery}
            isEmpty={!groups.length}
            loading="Carregando grupos…"
            error="Não foi possível carregar os grupos. Tente novamente."
            empty="Nenhum grupo cadastrado. Crie um grupo para começar."
          >
            <ul className={clientListClassName}>
              {groups.map((group) => (
                <li key={group.id}>
                  <button
                    type="button"
                    onClick={() => selectGroup(group)}
                    aria-pressed={selectedGroupId === group.id}
                    className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-3 text-left text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-blue-600 ${selectedGroupId === group.id ? "bg-blue-50 text-blue-900 dark:bg-blue-950/40 dark:text-blue-100" : "text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"}`}
                  >
                    <span className="font-medium">
                      {group.name}
                      {group.status ? null : (
                        <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          Inativo
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {group.clients.length} {group.clients.length === 1 ? "empresa" : "empresas"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </ClientListState>
        </div>

        <div>
          {selectedGroup ? (
            <div className="space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <label className="flex-1 text-sm font-medium text-slate-700 dark:text-slate-200">
                  Nome do grupo
                  <input
                    className={`${clientTextFieldClassName} mt-1.5`}
                    value={groupName}
                    onChange={(event) => setGroupName(event.target.value)}
                    maxLength={120}
                    disabled={!canEdit || isSaving}
                  />
                </label>
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => void saveGroupName()}
                    disabled={
                      isSaving || !groupName.trim() || groupName.trim() === selectedGroup.name
                    }
                    className={secondaryButtonClassName}
                  >
                    Salvar nome
                  </button>
                ) : null}
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => void toggleStatus()}
                    disabled={isSaving}
                    className={secondaryButtonClassName}
                  >
                    {selectedGroup.status ? "Inativar grupo" : "Reativar grupo"}
                  </button>
                ) : null}
              </div>

              <div>
                <label
                  className="block text-sm font-medium text-slate-700 dark:text-slate-200"
                  htmlFor="client-group-search"
                >
                  Buscar empresas
                </label>
                <input
                  id="client-group-search"
                  className={`${clientTextFieldClassName} mt-1.5`}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Nome, razão social ou documento"
                  disabled={!canEdit || isSaving}
                />
              </div>

              <div>
                <h4 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Empresas vinculadas ({selectedClientIds.length})
                </h4>
                {selectedGroup.clients.length ? (
                  <ul className="mb-3 flex flex-wrap gap-2">
                    {selectedGroup.clients.map((client) => (
                      <li key={client.id}>
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedClientIds((current) =>
                              current.filter((id) => id !== client.id),
                            )
                          }
                          disabled={!canEdit || isSaving}
                          className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-700 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 disabled:cursor-default disabled:opacity-75 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                          aria-label={`Remover ${client.name} do grupo`}
                        >
                          {client.name} ×
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : selectedClientIds.length === 0 ? (
                  <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
                    Este grupo ainda não tem empresas.
                  </p>
                ) : null}

                {clientsQuery.isLoading ? (
                  <p role="status" className="text-sm text-slate-500 dark:text-slate-400">
                    Carregando empresas…
                  </p>
                ) : clientsQuery.error ? (
                  <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">
                    Não foi possível carregar as empresas.
                  </p>
                ) : clientsQuery.data?.items.length ? (
                  <ul className="max-h-64 divide-y divide-slate-200 overflow-y-auto rounded-xl border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
                    {clientsQuery.data.items.map((client) => (
                      <li key={client.id}>
                        <label className="flex cursor-pointer items-start gap-3 px-3 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800">
                          <input
                            type="checkbox"
                            checked={selectedMemberSet.has(client.id)}
                            onChange={(event) => {
                              setSelectedClientIds((current) =>
                                event.target.checked
                                  ? [...new Set([...current, client.id])]
                                  : current.filter((id) => id !== client.id),
                              );
                            }}
                            disabled={!canEdit || isSaving}
                            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600 disabled:opacity-60"
                          />
                          <span className="min-w-0 text-slate-800 dark:text-slate-100">
                            <span className="block truncate font-medium">{client.name}</span>
                            {client.company_name ? (
                              <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                                {client.company_name}
                              </span>
                            ) : null}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="rounded-xl bg-slate-50 px-3 py-4 text-sm text-slate-600 dark:bg-slate-950/40 dark:text-slate-400">
                    Nenhuma empresa encontrada.
                  </p>
                )}
              </div>

              {canEdit ? (
                <button
                  type="button"
                  onClick={() => void saveClients()}
                  disabled={isSaving}
                  className={clientPrimaryButtonClassName}
                >
                  {isSaving ? "Salvando…" : "Substituir clientes do grupo"}
                </button>
              ) : null}
            </div>
          ) : (
            <p className="rounded-xl bg-slate-50 px-3 py-4 text-sm text-slate-600 dark:bg-slate-950/40 dark:text-slate-400">
              Selecione um grupo para consultar empresas e vínculos.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
