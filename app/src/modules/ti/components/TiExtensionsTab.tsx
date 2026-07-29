import { useMemo, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  Loader2,
  Pencil,
  Phone,
  PhoneCall,
  Save,
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
} from "../types";
import {
  TI_EXTENSION_NUMBER_LENGTH,
  isValidTiExtensionNumber,
  sanitizeTiExtensionNumber,
} from "../utils/extensionNumber";
import { TiNativeSelect } from "./TiNativeSelect";
import {
  TiDataTable,
  TiEmptyState,
  TiFieldLine,
  TiInlineNotice,
  TiPanel,
  TiQueryStatePanel,
  TiSectionHeader,
  TiTableAction,
  TiTextField,
} from "./tiFormControls";
import {
  tiCardClassName,
  tiFiveRowTableClassName,
  tiPrimaryButtonClassName,
} from "./tiWorkspaceUi";

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


export function TiExtensionsTab() {
  const { access } = useModuleAccess("ti");
  const canManageExtensions = access.isAdmin;
  const [selectedExtensionId, setSelectedExtensionId] = useState<TiId | undefined>();
  const [editingExtension, setEditingExtension] = useState<TiExtension | null>(null);
  const [extensionForm, setExtensionForm] = useState<ExtensionFormState>(
    initialExtensionFormState,
  );

  const extensionsQuery = useTiExtensions();
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

    if (!isValidTiExtensionNumber(number)) {
      toast.error("Informe um ramal com exatamente 4 dígitos.");
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

    if (!isValidTiExtensionNumber(number)) {
      toast.error("Informe um ramal com exatamente 4 dígitos.");
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
      />

      {!canManageExtensions ? (
        <TiInlineNotice tone="warning">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>Seu perfil atual permite consulta, mas não alterações de ramais.</p>
          </div>
        </TiInlineNotice>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
        <TiQueryStatePanel
          emptyState={
            <TiEmptyState
              icon={Phone}
              title="Nenhum ramal cadastrado"
              description="Ramais internos aparecem aqui quando forem vinculados a usuários."
            />
          }
          query={extensionsQuery}
        >
          {(rows) => (
            <TiDataTable className={tiFiveRowTableClassName} headers={["Ramal", "Usuário", ""]}>
              {rows.map((item) => (
                <tr key={getId(item.id)} className="text-slate-700 dark:text-slate-200">
                  <td className="px-4 py-2">
                    <button
                      type="button"
                      className="text-left font-semibold text-slate-900 hover:text-blue-700 dark:text-white dark:hover:text-blue-300"
                      onClick={() => setSelectedExtensionId(item.id)}
                    >
                      {formatText(item.number, "Sem número")}
                    </button>
                  </td>
                  <td className="px-4 py-2">{getExtensionUserName(item)}</td>
                  <td className="px-4 py-2">
                    <div className="flex justify-end gap-1">
                      <TiTableAction
                        icon={PhoneCall}
                        label="Abrir"
                        onClick={() => setSelectedExtensionId(item.id)}
                      />
                      {canManageExtensions ? (
                        <TiTableAction
                          icon={Pencil}
                          label="Editar"
                          onClick={() => openEditForm(item)}
                        />
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </TiDataTable>
          )}
        </TiQueryStatePanel>

        <div className="space-y-4">
          {selectedExtensionId ? (
            <section className={tiCardClassName}>
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
                  <TiFieldLine label="Número" value={formatText(selectedExtension.number)} />
                  <TiFieldLine label="Usuário" value={getExtensionUserName(selectedExtension)} />
                </div>
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {selectedExtensionQuery.isError
                    ? "Não conseguimos carregar este ramal."
                    : "Carregando detalhes do ramal..."}
                </p>
              )}
            </section>
          ) : null}

          {canManageExtensions ? (
            <form
              className={`${tiCardClassName} space-y-3`}
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
              <TiTextField
                inputMode="numeric"
                label="Número"
                maxLength={TI_EXTENSION_NUMBER_LENGTH}
                onChange={(event) =>
                  updateExtensionField(
                    "number",
                    sanitizeTiExtensionNumber(event.target.value),
                  )
                }
                placeholder="Ex: 1001"
                value={extensionForm.number}
              />
              <TiNativeSelect
                disabled={assignableUsersQuery.isLoading}
                label="Usuário"
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
