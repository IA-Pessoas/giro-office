import { useMemo, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  Save,
  ShieldCheck,
  X,
} from "lucide-react";
import { toast } from "react-toastify";

import { useModuleAccess } from "@modules/auth";
import { useAssignableUsers } from "@modules/rh";

import {
  useCreateTiPasswordMutation,
  useClearTiPasswordRevealCache,
  useTiPasswordReveal,
  useTiPasswords,
  useUpdateTiPasswordMutation,
} from "../hooks";
import type {
  TiId,
  TiListFilters,
  TiPasswordCreatePayload,
  TiPasswordListItem,
  TiPasswordUpdatePayload,
} from "../types";
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
  TiTextarea,
} from "./tiFormControls";
import {
  tiCardClassName,
  tiPrimaryButtonClassName,
  tiSecondaryButtonClassName,
} from "./tiWorkspaceUi";

type PasswordFormState = {
  local: string;
  user_id: string;
  password: string;
  notes: string;
};

const initialPasswordFormState: PasswordFormState = {
  local: "",
  user_id: "",
  password: "",
  notes: "",
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

function getPasswordUserName(item: TiPasswordListItem): string {
  return formatText(item.user?.full_name ?? item.user?.name ?? item.user_id, "-");
}

function toOptionalText(value: string): string | undefined {
  const trimmed = value.trim();

  return trimmed || undefined;
}

function getMutationErrorMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : "";

  if (/403|forbidden|permission|permiss/i.test(message)) {
    return "Acesso negado para executar esta ação.";
  }

  if (/409|conflict|conflito|cadastrad/i.test(message)) {
    return message || "Registro já cadastrado.";
  }

  return message || fallback;
}

function buildPasswordFormState(item?: TiPasswordListItem | null): PasswordFormState {
  if (!item) {
    return initialPasswordFormState;
  }

  return {
    local: formatText(item.local, ""),
    user_id: getId(item.user_id),
    password: "",
    notes: formatText(item.notes, ""),
  };
}

function MaskedSecret() {
  return (
    <span className="inline-flex min-h-8 items-center rounded-md border border-slate-200 bg-slate-50 px-3 font-mono text-sm tracking-normal text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
      ********
    </span>
  );
}


export function TiPasswordsTab() {
  const { access } = useModuleAccess("ti");
  const canManagePasswords = access.canEdit || access.isAdmin;
  const canRevealPasswords = canManagePasswords;
  const [filters] = useState<TiListFilters>({});
  const [revealPasswordId, setRevealPasswordId] = useState<TiId | null>(null);
  const [editingPassword, setEditingPassword] = useState<TiPasswordListItem | null>(null);
  const [passwordForm, setPasswordForm] = useState<PasswordFormState>(initialPasswordFormState);

  const passwordsQuery = useTiPasswords(filters);
  const revealQuery = useTiPasswordReveal(
    revealPasswordId,
    Boolean(revealPasswordId) && canRevealPasswords,
  );
  const assignableUsersQuery = useAssignableUsers({ enabled: canManagePasswords });
  const clearPasswordRevealCache = useClearTiPasswordRevealCache();
  const createPasswordMutation = useCreateTiPasswordMutation();
  const updatePasswordMutation = useUpdateTiPasswordMutation();

  const isSubmitting = createPasswordMutation.isPending || updatePasswordMutation.isPending;
  const users = assignableUsersQuery.data ?? [];
  const revealedPassword = revealQuery.data;

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

  function updatePasswordField<Key extends keyof PasswordFormState>(
    field: Key,
    value: PasswordFormState[Key],
  ) {
    setPasswordForm((current) => ({ ...current, [field]: value }));
  }

  function openCreateForm() {
    setEditingPassword(null);
    setPasswordForm(initialPasswordFormState);
  }

  function openEditForm(item: TiPasswordListItem) {
    setEditingPassword(item);
    setPasswordForm(buildPasswordFormState(item));
  }

  function closeReveal() {
    clearPasswordRevealCache(revealPasswordId);
    setRevealPasswordId(null);
  }

  function buildCreatePayload(): TiPasswordCreatePayload | null {
    const local = passwordForm.local.trim();
    const password = passwordForm.password.trim();

    if (!local) {
      toast.error("Informe o local da senha.");
      return null;
    }

    if (!passwordForm.user_id) {
      toast.error("Selecione o usuário vinculado.");
      return null;
    }

    if (!password) {
      toast.error("Informe a senha.");
      return null;
    }

    return {
      local,
      user_id: passwordForm.user_id,
      password,
      ...(toOptionalText(passwordForm.notes) ? { notes: toOptionalText(passwordForm.notes) } : {}),
    };
  }

  function buildUpdatePayload(): TiPasswordUpdatePayload | null {
    const local = passwordForm.local.trim();

    if (!local) {
      toast.error("Informe o local da senha.");
      return null;
    }

    if (!passwordForm.user_id) {
      toast.error("Selecione o usuário vinculado.");
      return null;
    }

    return {
      local,
      user_id: passwordForm.user_id,
      ...(toOptionalText(passwordForm.password)
        ? { password: toOptionalText(passwordForm.password) }
        : {}),
      ...(toOptionalText(passwordForm.notes) ? { notes: toOptionalText(passwordForm.notes) } : {}),
    };
  }

  async function handleSubmitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canManagePasswords || isSubmitting) {
      return;
    }

    try {
      if (editingPassword) {
        const payload = buildUpdatePayload();

        if (!payload) {
          return;
        }

        await updatePasswordMutation.mutateAsync({ id: editingPassword.id, payload });
        toast.success("Senha atualizada com sucesso.");
      } else {
        const payload = buildCreatePayload();

        if (!payload) {
          return;
        }

        await createPasswordMutation.mutateAsync(payload);
        toast.success("Senha criada com sucesso.");
      }

      setEditingPassword(null);
      setPasswordForm(initialPasswordFormState);
      clearPasswordRevealCache(revealPasswordId);
      setRevealPasswordId(null);
    } catch (error) {
      toast.error(getMutationErrorMessage(error, "Não foi possível salvar a senha."));
    }
  }

  async function handleCopyRevealedPassword() {
    const secret = revealedPassword?.password;

    if (!secret) {
      toast.error("Senha indisponivel para copia.");
      return;
    }

    await navigator.clipboard.writeText(secret);
    toast.success("Senha copiada.");
  }

  return (
    <TiPanel className="space-y-5">
      <TiSectionHeader
        title="Senhas"
        description="Organize credenciais administradas pelo time de Tecnologia."
        action={
          canManagePasswords ? (
            <button type="button" className={tiPrimaryButtonClassName} onClick={openCreateForm}>
              <Plus className="h-4 w-4" />
              <span>Nova senha</span>
            </button>
          ) : null
        }
      />

      {!canManagePasswords ? (
        <TiInlineNotice tone="warning">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>Seu perfil atual permite consulta, mas não revelar ou alterar credenciais.</p>
          </div>
        </TiInlineNotice>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
        <TiQueryStatePanel
          emptyState={
            <TiEmptyState
              icon={KeyRound}
              title="Nenhuma senha cadastrada"
              description="Credenciais autorizadas para seu perfil aparecem aqui quando cadastradas."
            />
          }
          query={passwordsQuery}
        >
          {(rows) => (
            <TiDataTable headers={["Local", "Usuário", "Notas", "Segredo", ""]}>
              {rows.map((item) => (
                <tr key={getId(item.id)} className="text-slate-700 dark:text-slate-200">
                  <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">
                    {formatText(item.local, "Sem local")}
                  </td>
                  <td className="px-4 py-3">{getPasswordUserName(item)}</td>
                  <td className="px-4 py-3">{formatText(item.notes)}</td>
                  <td className="px-4 py-3">
                    <MaskedSecret />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <TiTableAction
                        disabled={!canRevealPasswords}
                        icon={Eye}
                        label="Revelar"
                        onClick={() => {
                          clearPasswordRevealCache(revealPasswordId);
                          setRevealPasswordId(item.id);
                        }}
                      />
                      {canManagePasswords ? (
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
          <section className={tiCardClassName}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-blue-600 dark:text-blue-300" />
                <h3 className="text-sm font-semibold text-slate-950 dark:text-white">
                  Reveal de senha
                </h3>
              </div>
              {revealPasswordId ? (
                <TiTableAction icon={X} label="Ocultar" onClick={closeReveal} />
              ) : null}
            </div>
            {revealPasswordId && revealQuery.isLoading ? (
              <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando credencial...
              </div>
            ) : null}
            {revealPasswordId && revealQuery.isError ? (
              <p className="text-sm text-red-600 dark:text-red-300">
                Acesso negado ou indisponível.
              </p>
            ) : null}
            {revealedPassword ? (
              <div className="space-y-2">
                <TiFieldLine
                  label="Local"
                  value={formatText(revealedPassword.local, "Sem local")}
                />
                <TiFieldLine label="Usuário" value={getPasswordUserName(revealedPassword)} />
                <TiFieldLine
                  label="Senha"
                  value={revealedPassword.password ? formatText(revealedPassword.password) : <MaskedSecret />}
                />
                <TiFieldLine label="Notas" value={formatText(revealedPassword.notes)} />
                <div className="pt-2">
                  <button
                    type="button"
                    className={tiSecondaryButtonClassName}
                    disabled={!revealedPassword.password}
                    onClick={() => {
                      void handleCopyRevealedPassword();
                    }}
                  >
                    <EyeOff className="h-4 w-4" />
                    <span>Copiar senha</span>
                  </button>
                </div>
              </div>
            ) : !revealPasswordId ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Nenhuma credencial revelada.
              </p>
            ) : null}
          </section>

          {canManagePasswords ? (
            <form
              className={`${tiCardClassName} space-y-3`}
              onSubmit={handleSubmitPassword}
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-slate-950 dark:text-white">
                  {editingPassword ? "Editar senha" : "Nova senha"}
                </h3>
                {editingPassword ? (
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
                label="Local"
                onChange={(event) => updatePasswordField("local", event.target.value)}
                placeholder="VPN"
                value={passwordForm.local}
              />
              <TiNativeSelect
                disabled={assignableUsersQuery.isLoading}
                label="Usuário"
                onChange={(event) => updatePasswordField("user_id", event.target.value)}
                options={userOptions}
                value={passwordForm.user_id}
              />
              <TiTextField
                autoComplete="new-password"
                label={editingPassword ? "Nova senha" : "Senha"}
                onChange={(event) => updatePasswordField("password", event.target.value)}
                placeholder={editingPassword ? "Deixe em branco para manter" : undefined}
                type="password"
                value={passwordForm.password}
              />
              <TiTextarea
                className="min-h-20"
                label="Notas"
                onChange={(event) => updatePasswordField("notes", event.target.value)}
                placeholder="Observações internas"
                value={passwordForm.notes}
              />
              <button type="submit" className={tiPrimaryButtonClassName} disabled={isSubmitting}>
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                <span>{editingPassword ? "Salvar senha" : "Criar senha"}</span>
              </button>
            </form>
          ) : null}
        </div>
      </div>
    </TiPanel>
  );
}
