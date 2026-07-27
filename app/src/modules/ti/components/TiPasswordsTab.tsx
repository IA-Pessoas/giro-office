import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  Copy,
  Eye,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  Save,
} from "lucide-react";
import { toast } from "react-toastify";

import { useModuleAccess } from "@modules/auth";
import { useAssignableUsers } from "@modules/rh";
import { Dialog } from "@shared/components/ui/Dialog";

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
import { copySensitiveText } from "../utils/copySensitiveText";
import { TiNativeSelect } from "./TiNativeSelect";
import {
  TiDataTable,
  TiEmptyState,
  TiFieldLine,
  TiIconAction,
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
const PASSWORD_PAGE_SIZE = 20;
const PASSWORD_SEARCH_DEBOUNCE_MS = 400;

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
  const [filters, setFilters] = useState<TiListFilters>({
    page: 1,
    page_size: PASSWORD_PAGE_SIZE,
  });
  const [searchDraft, setSearchDraft] = useState("");
  const [revealPasswordId, setRevealPasswordId] = useState<TiId | null>(null);
  const [editingPassword, setEditingPassword] = useState<TiPasswordListItem | null>(null);
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
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
  const passwordItems = passwordsQuery.data?.items ?? [];
  const currentPasswordPage = Number(passwordsQuery.data?.page ?? filters.page ?? 1);
  const passwordPageSize = Number(passwordsQuery.data?.page_size ?? PASSWORD_PAGE_SIZE);
  const passwordTotal = Number(passwordsQuery.data?.total ?? passwordItems.length);
  const passwordFirstItem =
    passwordTotal === 0 ? 0 : (currentPasswordPage - 1) * passwordPageSize + 1;
  const passwordLastItem = Math.min(passwordTotal, passwordFirstItem + passwordItems.length - 1);
  const pageInfoText =
    passwordTotal === 0
      ? "Nenhum registro"
      : `${passwordFirstItem}-${passwordLastItem} de ${passwordTotal}`;
  const hasPasswordSearch = Boolean(filters.search);

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

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const nextSearch = toOptionalText(searchDraft);

      setFilters((current) => {
        if (
          (current.search ?? undefined) === nextSearch &&
          current.page === 1 &&
          current.page_size === PASSWORD_PAGE_SIZE
        ) {
          return current;
        }

        return {
          ...current,
          search: toOptionalText(searchDraft),
          page: 1,
          page_size: PASSWORD_PAGE_SIZE,
        };
      });
    }, PASSWORD_SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [searchDraft]);

  function updatePasswordField<Key extends keyof PasswordFormState>(
    field: Key,
    value: PasswordFormState[Key],
  ) {
    setPasswordForm((current) => ({ ...current, [field]: value }));
  }

  function openCreateForm() {
    setEditingPassword(null);
    setPasswordForm(initialPasswordFormState);
    setIsPasswordDialogOpen(true);
  }

  function openEditForm(item: TiPasswordListItem) {
    setEditingPassword(item);
    setPasswordForm(buildPasswordFormState(item));
    setIsPasswordDialogOpen(true);
  }

  function closePasswordDialog() {
    setEditingPassword(null);
    setPasswordForm(initialPasswordFormState);
    setIsPasswordDialogOpen(false);
  }

  function closeReveal() {
    clearPasswordRevealCache(revealPasswordId);
    setRevealPasswordId(null);
  }

  function setPasswordPage(nextPage: number) {
    setFilters((current) => ({
      ...current,
      page: Math.max(1, nextPage),
      page_size: PASSWORD_PAGE_SIZE,
    }));
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

      closePasswordDialog();
      clearPasswordRevealCache(revealPasswordId);
      setRevealPasswordId(null);
    } catch (error) {
      toast.error(getMutationErrorMessage(error, "Não foi possível salvar a senha."));
    }
  }

  async function handleCopyRevealedPassword() {
    const secret = revealedPassword?.password;

    if (!secret) {
      toast.error("Senha indisponível para cópia.");
      return;
    }

    const clipboard = typeof navigator === "undefined" ? undefined : navigator.clipboard;
    const copied = await copySensitiveText(secret, clipboard);

    if (copied) {
      toast.success("Senha copiada.");
      return;
    }

    toast.error(
      "Não foi possível copiar a senha. Verifique a permissão da área de transferência.",
    );
  }

  return (
    <TiPanel className="space-y-5">
      <TiSectionHeader
        title="Senhas"
        description="Organize credenciais administradas pelo time de Tecnologia."
        action={
          canManagePasswords ? (
            <TiIconAction
              icon={Plus}
              label="Nova senha"
              variant="primary"
              onClick={openCreateForm}
            />
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

      <div
        aria-label="Filtros de senhas"
        className={tiCardClassName}
      >
        <TiTextField
          label="Buscar por local, usuário ou notas"
          onChange={(event) => setSearchDraft(event.target.value)}
          placeholder="Local, usuário ou notas"
          value={searchDraft}
        />
      </div>

      <div aria-label="Conteúdo de senhas">
        <TiQueryStatePanel
          emptyState={
            <TiEmptyState
              icon={KeyRound}
              title={hasPasswordSearch ? "Nenhuma senha encontrada" : "Nenhuma senha cadastrada"}
              description={
                hasPasswordSearch
                  ? "Nenhuma senha encontrada para este termo."
                  : "Credenciais autorizadas para seu perfil aparecem aqui quando cadastradas."
              }
            />
          }
          query={passwordsQuery}
        >
          {(rows) => (
            <>
              <TiDataTable headers={["Local", "Usuário", "Notas", ""]}>
                {rows.map((item) => (
                  <tr key={getId(item.id)} className="text-slate-700 dark:text-slate-200">
                    <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">
                      {formatText(item.local, "Sem local")}
                    </td>
                    <td className="px-4 py-3">{getPasswordUserName(item)}</td>
                    <td className="px-4 py-3">
                      <span className="block max-w-xs truncate" title={formatText(item.notes)}>
                        {formatText(item.notes)}
                      </span>
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
              <div className="flex flex-col gap-2 text-sm text-slate-600 dark:text-slate-300 sm:flex-row sm:items-center sm:justify-between">
                <span>{pageInfoText}</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={tiSecondaryButtonClassName}
                    disabled={currentPasswordPage <= 1}
                    onClick={() => setPasswordPage(currentPasswordPage - 1)}
                  >
                    Anterior
                  </button>
                  <button
                    type="button"
                    className={tiSecondaryButtonClassName}
                    disabled={!passwordsQuery.data?.hasMore}
                    onClick={() => setPasswordPage(currentPasswordPage + 1)}
                  >
                    Próxima
                  </button>
                </div>
              </div>
            </>
          )}
        </TiQueryStatePanel>
      </div>

      <Dialog
        open={Boolean(revealPasswordId)}
        onOpenChange={(open) => {
          if (!open) {
            closeReveal();
          }
        }}
        title="Revelar senha"
        description="Visualize e copie a credencial selecionada."
        contentClassName="!w-[min(92vw,460px)] [&>header]:px-4 [&>header]:py-3"
        bodyClassName="!px-4 !py-3"
      >
        <div className="space-y-3">
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
                value={
                  revealedPassword.password ? (
                    <span className="break-all font-mono">
                      {formatText(revealedPassword.password)}
                    </span>
                  ) : (
                    <MaskedSecret />
                  )
                }
              />
              <TiFieldLine
                label="Notas"
                value={<span className="break-words">{formatText(revealedPassword.notes)}</span>}
              />
              <div className="pt-2">
                <button
                  type="button"
                  className={tiSecondaryButtonClassName}
                  disabled={!revealedPassword.password}
                  onClick={() => {
                    void handleCopyRevealedPassword();
                  }}
                >
                  <Copy className="h-4 w-4" />
                  <span>Copiar senha</span>
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </Dialog>

      {canManagePasswords ? (
        <Dialog
          open={isPasswordDialogOpen}
          onOpenChange={(open) => {
            if (!open) {
              closePasswordDialog();
            }
          }}
          title={editingPassword ? "Editar senha" : "Nova senha"}
          description="Cadastre e mantenha credenciais autorizadas para o time de Tecnologia."
          contentClassName="!w-[min(92vw,400px)] [&>header]:px-4 [&>header]:py-3"
          bodyClassName="!px-4 !py-3"
        >
          <form className="space-y-2" onSubmit={handleSubmitPassword}>
            <TiTextField
              className="h-9"
              label="Local"
              onChange={(event) => updatePasswordField("local", event.target.value)}
              placeholder="VPN"
              value={passwordForm.local}
            />
            <TiNativeSelect
              className="h-9"
              disabled={assignableUsersQuery.isLoading}
              label="Usuário"
              onChange={(event) => updatePasswordField("user_id", event.target.value)}
              options={userOptions}
              value={passwordForm.user_id}
            />
            <TiTextField
              autoComplete="new-password"
              className="h-9"
              label={editingPassword ? "Nova senha" : "Senha"}
              onChange={(event) => updatePasswordField("password", event.target.value)}
              placeholder={editingPassword ? "Deixe em branco para manter" : undefined}
              type="password"
              value={passwordForm.password}
            />
            <TiTextarea
              className="h-14 min-h-14 resize-none"
              label="Notas"
              onChange={(event) => updatePasswordField("notes", event.target.value)}
              placeholder="Observações internas"
              value={passwordForm.notes}
            />
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                className="h-9 px-3 text-sm font-semibold"
                onClick={closePasswordDialog}
              >
                Cancelar
              </button>
              <TiIconAction
                icon={Save}
                type="submit"
                label={
                  isSubmitting
                    ? "Salvando..."
                    : editingPassword
                      ? "Salvar senha"
                      : "Criar senha"
                }
                variant="primary"
                disabled={isSubmitting}
              />
            </div>
          </form>
        </Dialog>
      ) : null}
    </TiPanel>
  );
}
