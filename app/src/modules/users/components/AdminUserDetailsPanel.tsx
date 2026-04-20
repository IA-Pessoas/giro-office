import { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";

import { ADMIN_USER_STATUS_LABELS, type AdminUserStatus, normalizeAdminUserStatus } from "../services/adminUsersService";
import { userService } from "../services/userService";
import type { UpdateUserData, UserItem } from "../types";

interface AdminUserDetailsPanelProps {
  userId: string | null;
  departments: ReadonlyArray<{ id: string; name: string }>;
  departmentsError: boolean;
  onUserUpdated: () => Promise<unknown> | unknown;
}

const FIELD_CLASSNAME =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm transition-all outline-none placeholder:text-slate-400 focus:border-[var(--colors-brand-gradient-end)] focus:ring-2 focus:ring-[var(--colors-brand-gradient-start)]/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 disabled:cursor-not-allowed disabled:opacity-80";

const PRIMARY_ACTION_CLASSNAME =
  "rounded-xl bg-gradient-to-r from-[var(--colors-brand-gradient-start)] to-[var(--colors-brand-gradient-end)] px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-950/20 transition-all hover:from-[var(--colors-brand-gradient-hover-start)] hover:to-[var(--colors-brand-gradient-hover-end)] disabled:cursor-not-allowed disabled:opacity-70";

interface FormState {
  login: string;
  name: string;
  password: string;
  department_id: string;
  permission: string;
  status: AdminUserStatus;
}

function buildFormState(user: UserItem): FormState {
  return {
    login: user.login ?? "",
    name: user.name ?? "",
    password: "",
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
}: AdminUserDetailsPanelProps) {
  const [user, setUser] = useState<UserItem | null>(null);
  const [formData, setFormData] = useState<FormState | null>(null);
  const [isLoadingUser, setIsLoadingUser] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const loadUser = async (nextUserId: string) => {
    setIsLoadingUser(true);
    setLoadError(null);

    try {
      const nextUser = await userService.getById(nextUserId);
      setUser(nextUser);
      setFormData(buildFormState(nextUser));
    } catch (error) {
      setUser(null);
      setFormData(null);
      setLoadError("Nao foi possivel carregar os detalhes do usuario.");
      console.error(error);
    } finally {
      setIsLoadingUser(false);
    }
  };

  useEffect(() => {
    if (!userId) {
      setUser(null);
      setFormData(null);
      setLoadError(null);
      setSaveError(null);
      return;
    }

    void loadUser(userId);
  }, [userId]);

  const isSaveDisabled = useMemo(() => {
    return isSaving || isLoadingUser || !userId || departmentsError || departments.length === 0 || !formData;
  }, [departments.length, departmentsError, formData, isLoadingUser, isSaving, userId]);

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

  const handleSave = async () => {
    if (!userId || !formData) {
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    const payload: UpdateUserData = {
      name: formData.name,
      department_id: formData.department_id,
      permission: Number(formData.permission),
      status: formData.status,
      ...(formData.password.trim() ? { password: formData.password } : {}),
    };

    try {
      const updatedUser = await userService.update(userId, payload);
      setUser(updatedUser);
      setFormData(buildFormState(updatedUser));
      await onUserUpdated();
      toast.success("Usuario atualizado com sucesso!");
      await loadUser(userId);
    } catch (error) {
      setSaveError("Nao foi possivel salvar as alteracoes do usuario.");
      toast.error("Erro ao atualizar usuario.");
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  };

  if (!userId) {
    return (
      <div className="flex min-h-[480px] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 p-6 text-center dark:border-slate-700 dark:bg-slate-950/40">
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Nenhum usuario selecionado.</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Selecione um usuario na lista para abrir o painel de detalhes.
          </p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex min-h-[480px] items-center justify-center rounded-2xl border border-dashed border-rose-300 bg-rose-50/80 p-6 text-center dark:border-rose-800 dark:bg-rose-950/20">
        <div className="space-y-2">
          <p className="text-sm font-medium text-rose-700 dark:text-rose-300">{loadError}</p>
          <button
            type="button"
            onClick={() => void loadUser(userId)}
            className="rounded-xl border border-rose-200 px-4 py-2 text-sm font-medium text-rose-700 transition-colors hover:bg-rose-100 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-900/40"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  if (isLoadingUser || !formData) {
    return (
      <div className="flex min-h-[480px] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 p-6 text-center dark:border-slate-700 dark:bg-slate-950/40">
        <p className="text-sm text-slate-500 dark:text-slate-400">Carregando detalhes do usuario...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{user?.name}</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Atualize os dados do usuario selecionado usando os contratos atuais do backend.
        </p>
      </div>

      {departmentsError ? (
        <div className="rounded-2xl border border-amber-300 bg-amber-50/80 p-4 dark:border-amber-700 dark:bg-amber-950/20">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
            Nao foi possivel carregar os departamentos. A edicao foi bloqueada ate a lista estar disponivel.
          </p>
        </div>
      ) : null}

      {saveError ? (
        <div className="rounded-2xl border border-rose-300 bg-rose-50/80 p-4 dark:border-rose-800 dark:bg-rose-950/20">
          <p className="text-sm font-medium text-rose-700 dark:text-rose-300">{saveError}</p>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Login</label>
          <input value={formData.login} readOnly className={`${FIELD_CLASSNAME} bg-slate-100 dark:bg-slate-800`} />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Status</label>
          <select
            name="status"
            value={formData.status}
            onChange={handleInputChange}
            className={FIELD_CLASSNAME}
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
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Nome</label>
          <input name="name" value={formData.name} onChange={handleInputChange} className={FIELD_CLASSNAME} />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Nova senha</label>
          <input
            type="password"
            name="password"
            value={formData.password}
            onChange={handleInputChange}
            placeholder="Deixe em branco para manter"
            className={FIELD_CLASSNAME}
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Permissao</label>
          <input
            type="number"
            name="permission"
            value={formData.permission}
            onChange={handleInputChange}
            className={FIELD_CLASSNAME}
            inputMode="numeric"
            min={0}
          />
        </div>

        <div className="space-y-2 md:col-span-2">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Departamento</label>
          <select
            name="department_id"
            value={formData.department_id}
            onChange={handleInputChange}
            className={FIELD_CLASSNAME}
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

      <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-950/40">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Status atual</p>
        <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">
          {ADMIN_USER_STATUS_LABELS[formData.status]}
        </p>
      </div>

      <div className="flex justify-end">
        <button type="button" onClick={handleSave} className={PRIMARY_ACTION_CLASSNAME} disabled={isSaveDisabled}>
          {isSaving ? "Salvando..." : "Salvar alteracoes"}
        </button>
      </div>
    </div>
  );
}
