import { useState, type FormEvent } from "react";
import { AlertCircle, Archive, Boxes, Loader2, Pencil, Plus, RefreshCw, RotateCcw } from "lucide-react";

import {
  useArchivePessoalGroupMutation,
  useCreatePessoalGroupMutation,
  usePessoalGroups,
  useReactivatePessoalGroupMutation,
  useUpdatePessoalGroupMutation,
} from "../hooks/usePessoalGroups";
import {
  PESSOAL_GROUP_POLICIES,
  type PessoalGroup,
  type PessoalGroupPolicy,
} from "../types/groups";
import { getPessoalErrorMessage } from "../utils/pessoalErrorMessage";
import {
  pessoalPrimaryButtonClassName,
  pessoalSecondaryButtonClassName,
  pessoalTextFieldClassName,
} from "./pessoalFormControls";

interface PessoalGroupsSectionProps {
  canEdit: boolean;
}

export function PessoalGroupsSection({ canEdit }: PessoalGroupsSectionProps) {
  const groupsQuery = usePessoalGroups();
  const createMutation = useCreatePessoalGroupMutation();
  const archiveMutation = useArchivePessoalGroupMutation();
  const reactivateMutation = useReactivatePessoalGroupMutation();
  const [selectedGroup, setSelectedGroup] = useState<PessoalGroup | null>(null);
  const updateMutation = useUpdatePessoalGroupMutation(selectedGroup?.id ?? "");
  const [name, setName] = useState("");
  const [policy, setPolicy] = useState<PessoalGroupPolicy>("NORMAL");
  const [formError, setFormError] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  function openCreate() {
    setSelectedGroup(null);
    setName("");
    setPolicy("NORMAL");
    setFormError(null);
    setIsFormOpen(true);
  }

  function openEdit(group: PessoalGroup) {
    setSelectedGroup(group);
    setName(group.name);
    setPolicy(group.policy);
    setFormError(null);
    setIsFormOpen(true);
  }

  function closeForm() {
    setIsFormOpen(false);
    setFormError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit || !name.trim()) {
      setFormError("Informe o nome do grupo.");
      return;
    }

    try {
      const saved = selectedGroup
        ? await updateMutation.mutateAsync({ name, policy })
        : await createMutation.mutateAsync({ name, policy });
      setSelectedGroup(saved);
      setName(saved.name);
      setPolicy(saved.policy);
      setIsFormOpen(false);
    } catch (error) {
      setFormError(getPessoalErrorMessage(error, "Não foi possível salvar o grupo."));
    }
  }

  async function archiveGroup(group: PessoalGroup) {
    try {
      await archiveMutation.mutateAsync(group.id);
    } catch (error) {
      setFormError(getPessoalErrorMessage(error, "Não foi possível arquivar o grupo."));
    }
  }

  async function reactivateGroup(group: PessoalGroup) {
    try {
      await reactivateMutation.mutateAsync(group.id);
    } catch (error) {
      setFormError(getPessoalErrorMessage(error, "Não foi possível reativar o grupo."));
    }
  }

  const groups = groupsQuery.data ?? [];

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Boxes className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Grupos da folha</h2>
            </div>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Agrupe clientes sem perder a referência histórica da folha.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canEdit ? (
              <button type="button" onClick={openCreate} className={pessoalPrimaryButtonClassName}>
                <Plus className="h-4 w-4" />
                Novo grupo
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => groupsQuery.refetch()}
              disabled={groupsQuery.isFetching}
              className={pessoalSecondaryButtonClassName}
            >
              {groupsQuery.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Atualizar
            </button>
          </div>
        </div>

        {isFormOpen && canEdit ? (
          <form onSubmit={handleSubmit} className="mt-5 border-t border-gray-200 pt-5 dark:border-gray-700">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="flex flex-1 flex-col gap-2 text-sm text-gray-700 dark:text-gray-300">
                {selectedGroup ? "Editar grupo" : "Nome do grupo"}
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  disabled={isSubmitting}
                  className={pessoalTextFieldClassName}
                  autoFocus
                />
              </label>
              <label className="flex flex-1 flex-col gap-2 text-sm text-gray-700 dark:text-gray-300">
                Política de obrigações
                <select
                  value={policy}
                  onChange={(event) => setPolicy(event.target.value as PessoalGroupPolicy)}
                  disabled={isSubmitting}
                  className={pessoalTextFieldClassName}
                >
                  {PESSOAL_GROUP_POLICIES.map((option) => (
                    <option key={option} value={option}>
                      {option === "NORMAL" ? "Normal" : "Sem obrigações"}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex gap-2">
                <button type="button" onClick={closeForm} disabled={isSubmitting} className={pessoalSecondaryButtonClassName}>
                  Cancelar
                </button>
                <button type="submit" disabled={isSubmitting} className={pessoalPrimaryButtonClassName}>
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
                  Salvar
                </button>
              </div>
            </div>
            {formError ? <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-300">{formError}</p> : null}
          </form>
        ) : null}

        <div className="mt-5">
          {groupsQuery.isLoading ? (
            <StateMessage icon={Loader2} title="Carregando grupos" />
          ) : groupsQuery.isError ? (
            <StateMessage icon={AlertCircle} title="Não foi possível carregar grupos">
              {getPessoalErrorMessage(groupsQuery.error, "Falha ao carregar grupos.")}
            </StateMessage>
          ) : groups.length === 0 ? (
            <StateMessage icon={Boxes} title="Nenhum grupo disponível">
              O grupo Sem Movimento é provisionado com a organização.
            </StateMessage>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-gray-50 text-left text-xs font-semibold uppercase text-gray-700 dark:bg-gray-700/50 dark:text-gray-300">
                  <tr>
                    <th className="px-4 py-3">Grupo</th>
                    <th className="px-4 py-3">Política</th>
                    <th className="px-4 py-3">Estado</th>
                    {canEdit ? <th className="px-4 py-3 text-right">Ações</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {groups.map((group) => {
                    const isArchived = Boolean(group.archived_at);
                    const isSystemGroup = Boolean(group.system_key);

                    return (
                      <tr key={group.id} className="border-t border-gray-100 dark:border-gray-700">
                        <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{group.name}</td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{group.policy ?? "Sem política"}</td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                          {isArchived ? "Arquivado" : "Ativo"}
                        </td>
                        {canEdit ? (
                          <td className="px-4 py-3 text-right">
                            <div className="flex justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => openEdit(group)}
                                disabled={isSystemGroup}
                                title={isSystemGroup ? "Grupo sistêmico" : undefined}
                                className={pessoalSecondaryButtonClassName}
                              >
                                <Pencil className="h-4 w-4" />
                                Editar
                              </button>
                              {isArchived ? (
                                <button type="button" onClick={() => reactivateGroup(group)} disabled={reactivateMutation.isPending} className={pessoalSecondaryButtonClassName}>
                                  <RotateCcw className="h-4 w-4" />
                                  Reativar
                                </button>
                              ) : (
                                <button type="button" onClick={() => archiveGroup(group)} disabled={archiveMutation.isPending || isSystemGroup} title={isSystemGroup ? "Grupo sistêmico" : undefined} className={pessoalSecondaryButtonClassName}>
                                  <Archive className="h-4 w-4" />
                                  Arquivar
                                </button>
                              )}
                            </div>
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {!isFormOpen && formError ? <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-300">{formError}</p> : null}
        </div>
      </div>
    </section>
  );
}

function StateMessage({
  children,
  icon: Icon,
  title,
}: {
  children?: string;
  icon: typeof AlertCircle;
  title: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-900/30 dark:text-gray-300">
      <div className="flex gap-3">
        <Icon className={"mt-0.5 h-4 w-4 shrink-0" + (title === "Carregando grupos" ? " animate-spin" : "")} />
        <div><p className="font-semibold">{title}</p>{children ? <p className="mt-1">{children}</p> : null}</div>
      </div>
    </div>
  );
}
