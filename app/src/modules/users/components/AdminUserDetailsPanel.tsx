import { useEffect, useMemo, useState } from "react";
import { isAxiosError } from "axios";
import { useRouter } from "next/router";
import { toast } from "react-toastify";

import { canAccessAdministration, isOrganizationOwner } from "@modules/auth";
import { useAuth } from "@/context/AuthContext";
import { PasswordResetButton } from "@shared/components/PasswordResetButton";
import { CREATE_USER_PERMISSION_OPTIONS } from "../constants/createUserConfig";
import { ADMIN_USER_STATUS_LABELS, type AdminUserStatus, normalizeAdminUserStatus } from "../services/adminUsersService";
import type { UpdateUserData, UserItem } from "../types";
import type { AdminUserDetailsDataSource } from "../types/adminUserContracts";

interface AdminUserDetailsPanelProps {
  userId: string | null;
  departments: ReadonlyArray<{ id: string; name: string }>;
  departmentsError: boolean;
  onUserUpdated: () => Promise<unknown> | unknown;
  canManageUsers?: boolean;
  dataSource: AdminUserDetailsDataSource;
}

const FIELD_CLASSNAME =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm transition-all outline-none placeholder:text-slate-400 focus:border-[var(--colors-brand-gradient-end)] focus:ring-2 focus:ring-[var(--colors-brand-gradient-start)]/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 disabled:cursor-not-allowed disabled:opacity-80";

const SELECT_FIELD_CLASSNAME =
  "w-full appearance-none rounded-lg border border-slate-200 bg-white bg-[length:14px] bg-[position:right_0.95rem_center] bg-no-repeat px-3 py-2.5 pr-11 text-sm text-slate-900 shadow-sm transition-all outline-none focus:border-[var(--colors-brand-gradient-end)] focus:ring-2 focus:ring-[var(--colors-brand-gradient-start)]/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 disabled:cursor-not-allowed disabled:opacity-80";

const SELECT_ARROW_STYLE = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none'%3E%3Cpath d='m5 7.5 5 5 5-5' stroke='%2394a3b8' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
} as const;

const PRIMARY_ACTION_CLASSNAME =
  "rounded-xl bg-gradient-to-r from-[var(--colors-brand-gradient-start)] to-[var(--colors-brand-gradient-end)] px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-950/20 transition-all hover:from-[var(--colors-brand-gradient-hover-start)] hover:to-[var(--colors-brand-gradient-hover-end)] disabled:cursor-not-allowed disabled:opacity-70";

const SECONDARY_ACTION_CLASSNAME =
  "rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-70 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800";

const PANEL_CLASSNAME =
  "rounded-2xl bg-slate-50/70 dark:bg-slate-950/40";

const FEEDBACK_PANEL_CLASSNAME =
  "rounded-2xl bg-slate-50/70 p-4 dark:bg-slate-950/40";

const EMPTY_STATE_CLASSNAME =
  "flex h-full min-h-[480px] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-6 text-center dark:border-slate-700 dark:bg-slate-950/30";

const LABEL_CLASSNAME = "dialog-neutral-label block text-sm font-medium text-slate-700 dark:text-white";

const TEXT_CLASSNAME = "dialog-neutral-text text-sm text-slate-700 dark:text-white";

const MUTED_CLASSNAME = "dialog-neutral-muted text-sm text-slate-500 dark:text-slate-300";

interface FormState {
  login: string;
  name: string;
  department_id: string;
  permission: string;
  status: AdminUserStatus;
}

function buildFormState(user: UserItem): FormState {
  return {
    login: user.login ?? "",
    name: user.name ?? "",
    department_id: user.department_id ?? "",
    permission: String(user.permission ?? 0),
    status: normalizeAdminUserStatus(user.status) ?? "active",
  };
}

export function AdminUserDetailsPanel({
  userId,
  departments,
  departmentsError,
  onUserUpdated,
  canManageUsers,
  dataSource,
}: AdminUserDetailsPanelProps) {
  const router = useRouter();
  const { user: currentUser } = useAuth();
  const hasAdminAccess = canManageUsers ?? canAccessAdministration(currentUser);
  const [user, setUser] = useState<UserItem | null>(null);
  const [formData, setFormData] = useState<FormState | null>(null);
  const [isLoadingUser, setIsLoadingUser] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const loadUser = async (nextUserId: string) => {
    if (!hasAdminAccess) {
      return;
    }

    setIsLoadingUser(true);
    setLoadError(null);

    try {
      const nextUser = await dataSource.loadUser(nextUserId);
      setUser(nextUser);
      setFormData(buildFormState(nextUser));
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 403) {
        void router.replace("/dashboard");
        return;
      }

      setUser(null);
      setFormData(null);
      setLoadError("Não foi possível carregar os detalhes do usuário.");
      console.error(error);
    } finally {
      setIsLoadingUser(false);
    }
  };

  useEffect(() => {
    if (!currentUser) {
      return;
    }

    if (!hasAdminAccess) {
      void router.replace("/dashboard");
    }
  }, [currentUser, hasAdminAccess, router]);

  useEffect(() => {
    if (!userId) {
      setUser(null);
      setFormData(null);
      setLoadError(null);
      setSaveError(null);
      return;
    }

    void loadUser(userId);
  }, [hasAdminAccess, userId]);

  const isSaveDisabled = useMemo(() => {
    return isSaving || isLoadingUser || !userId || departmentsError || departments.length === 0 || !formData;
  }, [departments.length, departmentsError, formData, isLoadingUser, isSaving, userId]);

  const isOwner = isOrganizationOwner(user);

  const hasKnownPermission = useMemo(() => {
    if (!formData) {
      return true;
    }

    return CREATE_USER_PERMISSION_OPTIONS.some((option) => String(option.value) === formData.permission);
  }, [formData]);

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = event.target;

    setFormData((currentFormData) => {
      if (!currentFormData) {
        return currentFormData;
      }

      return {
        ...currentFormData,
        [name]: value,
      };
    });
  };

  const persistUserUpdate = async () => {
    if (!userId || !formData) {
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    const payload: UpdateUserData = {
      name: formData.name,
      department_id: formData.department_id,
      // O papel do owner não é um nível de permissão (ADR 0002): não sobrescrever.
      ...(isOwner ? {} : { permission: Number(formData.permission) }),
      status: formData.status,
    };

    try {
      const updatedUser = await dataSource.saveUser(userId, payload);
      setUser(updatedUser);
      setFormData(buildFormState(updatedUser));
      await onUserUpdated();
      toast.success("Usuário atualizado com sucesso!");
      await loadUser(userId);
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 403) {
        await router.replace("/dashboard");
        return;
      }

      setSaveError("Não foi possível salvar as alterações do usuário.");
      toast.error("Erro ao atualizar usuário.");
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async () => {
    if (!formData) {
      return;
    }

    await persistUserUpdate();
  };

  if (!userId) {
    return (
      <div className={EMPTY_STATE_CLASSNAME}>
        <div className="space-y-2">
          <p className={TEXT_CLASSNAME}>Nenhum usuário selecionado.</p>
          <p className={MUTED_CLASSNAME}>
            Selecione um usuário na lista para abrir o painel de detalhes.
          </p>
        </div>
      </div>
    );
  }

  if (!hasAdminAccess) {
    return null;
  }

  if (loadError) {
    return (
      <div className={EMPTY_STATE_CLASSNAME}>
        <div className="space-y-2">
          <p className={TEXT_CLASSNAME}>{loadError}</p>
          <button
            type="button"
            onClick={() => void loadUser(userId)}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  if (isLoadingUser || !formData) {
    return (
      <div className={EMPTY_STATE_CLASSNAME}>
        <p className={MUTED_CLASSNAME}>Carregando detalhes do usuário...</p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-[480px] flex-col overflow-hidden">
      <div className="space-y-1 pb-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{user?.name}</h2>
        <p className={MUTED_CLASSNAME}>
          Revise e atualize os dados do usuário selecionado.
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="space-y-6">
          {departmentsError ? (
            <div className={FEEDBACK_PANEL_CLASSNAME}>
              <p className={TEXT_CLASSNAME}>
                Não foi possível carregar os departamentos. A edição foi bloqueada até a lista estar disponível.
              </p>
            </div>
          ) : null}

          {saveError ? (
            <div className={FEEDBACK_PANEL_CLASSNAME}>
              <p className={TEXT_CLASSNAME}>{saveError}</p>
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className={LABEL_CLASSNAME}>Login</label>
              <input
                value={formData.login}
                readOnly
                className={`${FIELD_CLASSNAME} bg-slate-100 dark:bg-slate-800`}
              />
            </div>

            <div className="space-y-2">
              <label className={LABEL_CLASSNAME}>Status</label>
              <select
                name="status"
                value={formData.status}
                onChange={handleInputChange}
                className={SELECT_FIELD_CLASSNAME}
                style={SELECT_ARROW_STYLE}
                disabled={departmentsError}
              >
                {Object.entries(ADMIN_USER_STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className={LABEL_CLASSNAME}>Nome</label>
              <input name="name" value={formData.name} onChange={handleInputChange} className={FIELD_CLASSNAME} />
            </div>

            <div className="space-y-2">
              <p className={LABEL_CLASSNAME}>Senha</p>
              <PasswordResetButton
                onSend={() => dataSource.sendPasswordReset(userId)}
                className={SECONDARY_ACTION_CLASSNAME}
                disabled={isSaving}
              />
            </div>

            <div className="space-y-2">
              <label className={LABEL_CLASSNAME} htmlFor="admin-user-permission">
                Permissão
              </label>
              {isOwner ? (
                <input
                  id="admin-user-permission"
                  value="Owner"
                  readOnly
                  aria-describedby="admin-user-owner-hint"
                  className={`${FIELD_CLASSNAME} bg-slate-100 dark:bg-slate-800`}
                />
              ) : (
                <select
                  id="admin-user-permission"
                  name="permission"
                  value={formData.permission}
                  onChange={handleInputChange}
                  className={SELECT_FIELD_CLASSNAME}
                  style={SELECT_ARROW_STYLE}
                >
                  {!hasKnownPermission ? (
                    <option value={formData.permission}>Permissão atual ({formData.permission})</option>
                  ) : null}
                  {CREATE_USER_PERMISSION_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              )}
              {isOwner ? (
                <p id="admin-user-owner-hint" className={MUTED_CLASSNAME}>
                  Acesso total à organização, independente dos níveis por módulo.
                </p>
              ) : null}
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className={LABEL_CLASSNAME}>Departamento</label>
              <select
                name="department_id"
                value={formData.department_id}
                onChange={handleInputChange}
                className={SELECT_FIELD_CLASSNAME}
                style={SELECT_ARROW_STYLE}
                disabled={departmentsError}
              >
                <option value="">Selecione um departamento</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className={`${PANEL_CLASSNAME} flex items-center justify-between gap-4 p-4`}>
            <div className="space-y-1">
              <p className={LABEL_CLASSNAME}>Status atual</p>
              <p className={MUTED_CLASSNAME}>
                Estado aplicado ao usuário selecionado.
              </p>
            </div>
            <span className="rounded-full bg-[var(--colors-brand-soft)] px-3 py-1.5 text-sm font-semibold text-[var(--colors-brand-strong)] dark:bg-blue-900/30 dark:text-blue-300">
              {ADMIN_USER_STATUS_LABELS[formData.status]}
            </span>
          </div>
        </div>
      </div>

      <div className="pt-6">
        <div className="flex justify-end">
          <button type="button" onClick={handleSave} className={PRIMARY_ACTION_CLASSNAME} disabled={isSaveDisabled}>
            {isSaving ? "Salvando..." : "Salvar alterações"}
          </button>
        </div>
      </div>

    </div>
  );
}
