import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import {
  AlertTriangle,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  X,
  type LucideIcon,
} from "lucide-react";
import { toast } from "react-toastify";

import { useModuleAccess } from "@modules/auth";
import { useAssignableUsers } from "@modules/rh";
import { cn } from "@shared/ui/newLayout/utils";

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
import { TiIconAction, TiPanel, TiSectionHeader } from "./tiFormControls";
import {
  tiInputClassName,
  tiLabelClassName,
  tiPrimaryButtonClassName,
  tiSecondaryButtonClassName,
} from "./tiWorkspaceUi";

type ListQuery<T> = Pick<
  UseQueryResult<T[], Error>,
  "data" | "error" | "isError" | "isFetching" | "isLoading" | "refetch"
>;

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
    return "Acesso negado para executar esta acao.";
  }

  if (/409|conflict|conflito|cadastrad/i.test(message)) {
    return message || "Registro ja cadastrado.";
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
        Carregando dados...
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900/40 dark:bg-red-950/20">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-red-700 dark:text-red-300">
              Nao foi possivel carregar.
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

function TextField({
  autoComplete,
  label,
  onChange,
  placeholder,
  type = "text",
  value,
}: {
  autoComplete?: string;
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: "password" | "text";
  value: string;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-2">
      <span className={tiLabelClassName}>{label}</span>
      <input
        autoComplete={autoComplete}
        className={tiInputClassName}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type={type}
        value={value}
      />
    </label>
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
      toast.error("Selecione o usuario vinculado.");
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
      toast.error("Selecione o usuario vinculado.");
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
      toast.error(getMutationErrorMessage(error, "Nao foi possivel salvar a senha."));
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
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>Seu perfil atual permite consulta, mas nao revelar ou alterar credenciais.</p>
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
        <QueryStatePanel emptyTitle="Nenhuma senha cadastrada." icon={KeyRound} query={passwordsQuery}>
          {(rows) => (
            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
              <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Local</th>
                    <th className="px-4 py-3 text-left font-semibold">Usuario</th>
                    <th className="px-4 py-3 text-left font-semibold">Notas</th>
                    <th className="px-4 py-3 text-left font-semibold">Segredo</th>
                    <th className="px-4 py-3 text-right font-semibold">Acoes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
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
                          <button
                            type="button"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                            disabled={!canRevealPasswords}
                            onClick={() => {
                              clearPasswordRevealCache(revealPasswordId);
                              setRevealPasswordId(item.id);
                            }}
                            title="Revelar senha"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          {canManagePasswords ? (
                            <button
                              type="button"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                              onClick={() => openEditForm(item)}
                              title="Editar senha"
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
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-blue-600 dark:text-blue-300" />
                <h3 className="text-sm font-semibold text-slate-950 dark:text-white">
                  Reveal de senha
                </h3>
              </div>
              {revealPasswordId ? (
                <button
                  type="button"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                  onClick={closeReveal}
                  title="Ocultar senha"
                >
                  <X className="h-4 w-4" />
                </button>
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
                Acesso negado ou indisponivel.
              </p>
            ) : null}
            {revealedPassword ? (
              <div className="space-y-2">
                <FieldLine label="Local" value={formatText(revealedPassword.local, "Sem local")} />
                <FieldLine label="Usuario" value={getPasswordUserName(revealedPassword)} />
                <FieldLine
                  label="Senha"
                  value={revealedPassword.password ? formatText(revealedPassword.password) : <MaskedSecret />}
                />
                <FieldLine label="Notas" value={formatText(revealedPassword.notes)} />
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
              className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"
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
              <TextField
                label="Local"
                onChange={(value) => updatePasswordField("local", value)}
                placeholder="VPN"
                value={passwordForm.local}
              />
              <TiNativeSelect
                disabled={assignableUsersQuery.isLoading}
                label="Usuario"
                onChange={(event) => updatePasswordField("user_id", event.target.value)}
                options={userOptions}
                value={passwordForm.user_id}
              />
              <TextField
                autoComplete="new-password"
                label={editingPassword ? "Nova senha" : "Senha"}
                onChange={(value) => updatePasswordField("password", value)}
                placeholder={editingPassword ? "Deixe em branco para manter" : undefined}
                type="password"
                value={passwordForm.password}
              />
              <label className="flex min-w-0 flex-col gap-2">
                <span className={tiLabelClassName}>Notas</span>
                <textarea
                  className={cn(tiInputClassName, "min-h-20 py-2")}
                  onChange={(event) => updatePasswordField("notes", event.target.value)}
                  placeholder="Observacoes internas"
                  value={passwordForm.notes}
                />
              </label>
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
