import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import {
  AlertTriangle,
  Loader2,
  Pencil,
  Phone,
  PhoneCall,
  Plus,
  RefreshCw,
  Save,
  type LucideIcon,
} from "lucide-react";
import { toast } from "react-toastify";

import { useModuleAccess } from "@modules/auth";
import { useAssignableUsers } from "@modules/rh";

import {
  useCreateTiExtensionMutation,
  useTiExtension,
  useTiExtensions,
  useUpdateTiExtensionMutation,
} from "../hooks";
import type {
  TiExtension,
  TiExtensionCreatePayload,
  TiExtensionUpdatePayload,
  TiId,
  TiListFilters,
} from "../types";
import { TiNativeSelect } from "./TiNativeSelect";
import { TiIconAction, TiPanel, TiSectionHeader } from "./tiFormControls";
import {
  tiInputClassName,
  tiLabelClassName,
  tiPrimaryButtonClassName,
} from "./tiWorkspaceUi";

type ListQuery<T> = Pick<
  UseQueryResult<T[], Error>,
  "data" | "error" | "isError" | "isFetching" | "isLoading" | "refetch"
>;

type ExtensionFormState = {
  number: string;
  user_id: string;
};

const initialExtensionFormState: ExtensionFormState = {
  number: "",
  user_id: "",
};

function formatText(value: unknown, fallback = "-"): string {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  return String(value);
}

function getId(value: TiId | null | undefined): string {
  return value === null || value === undefined ? "" : String(value);
}

function getExtensionUserName(item: TiExtension): string {
  return formatText(item.user?.full_name ?? item.user?.name ?? item.user_id, "-");
}

function getMutationErrorMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : "";

  if (/403|forbidden|permission|permiss/i.test(message)) {
    return "Acesso negado para executar esta ação.";
  }

  if (/409|conflict|duplic|existe|cadastrad/i.test(message)) {
    return message || "Já existe um ramal com estes dados.";
  }

  return message || fallback;
}

function buildExtensionFormState(item?: TiExtension | null): ExtensionFormState {
  if (!item) {
    return initialExtensionFormState;
  }

  return {
    number: formatText(item.number, ""),
    user_id: getId(item.user_id),
  };
}

function QueryStatePanel<T>({
  children,
  emptyTitle,
  icon: Icon,
  query,
}: {
  children: (rows: T[]) => ReactNode;
  emptyTitle: string;
  icon: LucideIcon;
  query: ListQuery<T>;
}) {
  if (query.isLoading) {
    return (
      <div className="flex min-h-32 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-6 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando informações...
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900/40 dark:bg-red-950/20">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-red-700 dark:text-red-300">
              Não conseguimos carregar as informações.
            </p>
            <p className="mt-1 text-sm text-red-600 dark:text-red-300/80">
              {query.error?.message ?? "Tente novamente."}
            </p>
          </div>
          <TiIconAction
            icon={RefreshCw}
            label="Tentar novamente"
            onClick={() => {
              void query.refetch();
            }}
          />
        </div>
      </div>
    );
  }

  const rows = query.data ?? [];

  if (rows.length === 0) {
    return (
      <div className="flex min-h-32 items-center gap-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 dark:border-slate-700 dark:bg-slate-900/60">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-slate-700 shadow-sm dark:bg-slate-950 dark:text-slate-200">
          <Icon className="h-5 w-5" />
        </div>
        <p className="text-sm font-medium text-slate-600 dark:text-slate-300">{emptyTitle}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {query.isFetching ? (
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Atualizando...
        </div>
      ) : null}
      {children(rows)}
    </div>
  );
}

function FieldLine({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-2 last:border-b-0 last:pb-0 dark:border-slate-800">
      <span className="shrink-0 text-xs font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-500">
        {label}
      </span>
      <span className="min-w-0 text-right text-sm font-medium text-slate-800 dark:text-slate-100">
        {value}
      </span>
    </div>
  );
}

export function TiExtensionsTab() {
  const { access } = useModuleAccess("ti");
  const canManageExtensions = access.canEdit || access.isAdmin;
  const [filters] = useState<TiListFilters>({});
  const [selectedExtensionId, setSelectedExtensionId] = useState<TiId | undefined>();
  const [editingExtension, setEditingExtension] = useState<TiExtension | null>(null);
  const [extensionForm, setExtensionForm] = useState<ExtensionFormState>(
    initialExtensionFormState,
  );

  const extensionsQuery = useTiExtensions(filters);
  const selectedExtensionQuery = useTiExtension(selectedExtensionId, {
    enabled: Boolean(selectedExtensionId),
  });
  const assignableUsersQuery = useAssignableUsers({ enabled: canManageExtensions });
  const createExtensionMutation = useCreateTiExtensionMutation();
  const updateExtensionMutation = useUpdateTiExtensionMutation();
  const isSubmitting = createExtensionMutation.isPending || updateExtensionMutation.isPending;

  const users = assignableUsersQuery.data ?? [];
  const selectedExtension = selectedExtensionQuery.data;
  const userOptions = useMemo(
    () => [
      { value: "", label: "Selecione" },
      ...users.map((user) => ({
        value: user.id,
        label: user.departmentName ? `${user.name} - ${user.departmentName}` : user.name,
      })),
    ],
    [users],
  );

  function updateExtensionField<Key extends keyof ExtensionFormState>(
    field: Key,
    value: ExtensionFormState[Key],
  ) {
    setExtensionForm((current) => ({ ...current, [field]: value }));
  }

  function openCreateForm() {
    setEditingExtension(null);
    setExtensionForm(initialExtensionFormState);
  }

  function openEditForm(item: TiExtension) {
    setSelectedExtensionId(item.id);
    setEditingExtension(item);
    setExtensionForm(buildExtensionFormState(item));
  }

  function buildCreatePayload(): TiExtensionCreatePayload | null {
    const number = extensionForm.number.trim();

    if (!number) {
      toast.error("Informe o número do ramal.");
      return null;
    }

    if (!extensionForm.user_id) {
      toast.error("Selecione o usuário vinculado.");
      return null;
    }

    return {
      number,
      user_id: extensionForm.user_id,
    };
  }

  function buildUpdatePayload(): TiExtensionUpdatePayload | null {
    const number = extensionForm.number.trim();

    if (!number) {
      toast.error("Informe o número do ramal.");
      return null;
    }

    if (!extensionForm.user_id) {
      toast.error("Selecione o usuário vinculado.");
      return null;
    }

    return {
      number,
      user_id: extensionForm.user_id,
    };
  }

  async function handleSubmitExtension(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canManageExtensions || isSubmitting) {
      return;
    }

    try {
      if (editingExtension) {
        const payload = buildUpdatePayload();

        if (!payload) {
          return;
        }

        await updateExtensionMutation.mutateAsync({ id: editingExtension.id, payload });
        toast.success("Ramal atualizado com sucesso.");
      } else {
        const payload = buildCreatePayload();

        if (!payload) {
          return;
        }

        const created = await createExtensionMutation.mutateAsync(payload);
        setSelectedExtensionId(created.id);
        toast.success("Ramal criado com sucesso.");
      }

      setEditingExtension(null);
      setExtensionForm(initialExtensionFormState);
    } catch (error) {
      toast.error(getMutationErrorMessage(error, "Não foi possível salvar o ramal."));
    }
  }

  return (
    <TiPanel className="space-y-5">
      <TiSectionHeader
        title="Ramais"
        description="Consulte e mantenha a lista de telefones internos."
        action={
          canManageExtensions ? (
            <button type="button" className={tiPrimaryButtonClassName} onClick={openCreateForm}>
              <Plus className="h-4 w-4" />
              <span>Novo ramal</span>
            </button>
          ) : null
        }
      />

      {!canManageExtensions ? (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>Seu perfil atual permite consulta, mas nao alteracoes de ramais.</p>
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
        <QueryStatePanel emptyTitle="Nenhum ramal cadastrado." icon={Phone} query={extensionsQuery}>
          {(rows) => (
            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
              <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Ramal</th>
                    <th className="px-4 py-3 text-left font-semibold">Usuario</th>
                    <th className="px-4 py-3 text-right font-semibold">Acoes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {rows.map((item) => (
                    <tr key={getId(item.id)} className="text-slate-700 dark:text-slate-200">
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          className="text-left font-semibold text-slate-900 hover:text-blue-700 dark:text-white dark:hover:text-blue-300"
                          onClick={() => setSelectedExtensionId(item.id)}
                        >
                          {formatText(item.number, "Sem número")}
                        </button>
                      </td>
                      <td className="px-4 py-3">{getExtensionUserName(item)}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                            onClick={() => setSelectedExtensionId(item.id)}
                            title="Abrir detalhe"
                          >
                            <PhoneCall className="h-4 w-4" />
                          </button>
                          {canManageExtensions ? (
                            <button
                              type="button"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                              onClick={() => openEditForm(item)}
                              title="Editar ramal"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </QueryStatePanel>

        <div className="space-y-4">
          <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-slate-950 dark:text-white">
                Ramal selecionado
              </h3>
              {selectedExtensionQuery.isFetching ? (
                <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
              ) : null}
            </div>
            {selectedExtension ? (
              <div className="space-y-2">
                <FieldLine label="Numero" value={formatText(selectedExtension.number)} />
                <FieldLine label="Usuario" value={getExtensionUserName(selectedExtension)} />
                <FieldLine label="ID" value={getId(selectedExtension.id)} />
              </div>
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Selecione um ramal para ver detalhes.
              </p>
            )}
          </section>

          {canManageExtensions ? (
            <form
              className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"
              onSubmit={handleSubmitExtension}
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-slate-950 dark:text-white">
                  {editingExtension ? "Editar ramal" : "Novo ramal"}
                </h3>
                {editingExtension ? (
                  <button
                    type="button"
                    className="text-xs font-semibold text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                    onClick={openCreateForm}
                  >
                    Cancelar
                  </button>
                ) : null}
              </div>
              <label className="flex min-w-0 flex-col gap-2">
                <span className={tiLabelClassName}>Numero</span>
                <input
                  className={tiInputClassName}
                  onChange={(event) => updateExtensionField("number", event.target.value)}
                  placeholder="1001"
                  value={extensionForm.number}
                />
              </label>
              <TiNativeSelect
                disabled={assignableUsersQuery.isLoading}
                label="Usuario"
                onChange={(event) => updateExtensionField("user_id", event.target.value)}
                options={userOptions}
                value={extensionForm.user_id}
              />
              <button type="submit" className={tiPrimaryButtonClassName} disabled={isSubmitting}>
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                <span>{editingExtension ? "Salvar ramal" : "Criar ramal"}</span>
              </button>
            </form>
          ) : null}
        </div>
      </div>
    </TiPanel>
  );
}
