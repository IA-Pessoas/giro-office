import React, { useMemo, useState } from 'react';
import { toast } from 'react-toastify';

import { resolveDepartmentModuleKey } from '@modules/auth';
import { Dialog } from '@shared/components';

import {
  CREATE_USER_MODULE_OPTIONS,
  CREATE_USER_PERMISSION_OPTIONS,
} from '../constants/createUserConfig';
import type { UserItem, UserPermission } from '../types';
import {
  buildAdminCreateUserPayload,
  type CreateUserFormState,
} from '../utils/createUserPayload';

interface CreateUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUserCreated: (newUser: UserItem) => void;
  departments?: ReadonlyArray<{ id: string; name: string }>;
  departmentsLoading?: boolean;
  departmentsError?: boolean;
  onRetryDepartments?: () => void;
  organizationId?: string;
  organizationIdLoading?: boolean;
  invitedBy?: string;
  canCreateOrganizationOwner?: boolean;
}

const INITIAL_FORM_DATA: CreateUserFormState = {
  name: '',
  login: '',
  password: '',
  department_id: '',
  departmentPermission: 0,
  isOrganizationOwner: false,
};

type ModuleKey = (typeof CREATE_USER_MODULE_OPTIONS)[number]['key'];

type ModuleSelectionState = Record<ModuleKey, { enabled: boolean; level: 0 | 1 | 2 }>;
type ModuleSelectValue = 'none' | '0' | '1' | '2';

const FIELD_CLASSNAME =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm transition-all outline-none placeholder:text-slate-400 focus:border-[var(--colors-brand-gradient-end)] focus:ring-2 focus:ring-[var(--colors-brand-gradient-start)]/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 disabled:cursor-not-allowed disabled:opacity-80';

const SELECT_FIELD_CLASSNAME =
  'w-full appearance-none rounded-lg border border-slate-200 bg-white bg-[length:14px] bg-[position:right_0.95rem_center] bg-no-repeat px-3 py-2.5 pr-11 text-sm text-slate-900 shadow-sm transition-all outline-none focus:border-[var(--colors-brand-gradient-end)] focus:ring-2 focus:ring-[var(--colors-brand-gradient-start)]/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 disabled:cursor-not-allowed disabled:opacity-80';

const SELECT_ARROW_STYLE = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none'%3E%3Cpath d='m5 7.5 5 5 5-5' stroke='%2394a3b8' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
} as const;

const MODULE_CARD_CLASSNAME =
  'rounded-2xl border border-slate-200 bg-slate-50/90 p-3 dark:border-slate-700 dark:bg-slate-800/70';

const PRIMARY_ACTION_CLASSNAME =
  'rounded-xl bg-gradient-to-r from-[var(--colors-brand-gradient-start)] to-[var(--colors-brand-gradient-end)] px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-950/20 transition-all hover:from-[var(--colors-brand-gradient-hover-start)] hover:to-[var(--colors-brand-gradient-hover-end)] disabled:cursor-not-allowed disabled:opacity-70';

const FIELD_LABEL_CLASSNAME =
  'dialog-neutral-label mb-2 block text-sm font-medium text-black dark:text-white';

const SECTION_TITLE_CLASSNAME =
  'dialog-neutral-label block text-sm font-medium text-black dark:text-white';

const SECTION_DESCRIPTION_CLASSNAME =
  'dialog-neutral-muted text-xs text-slate-600 dark:text-slate-300';

function createInitialModuleSelections(): ModuleSelectionState {
  return CREATE_USER_MODULE_OPTIONS.reduce((acc, moduleOption) => {
    acc[moduleOption.key] = { enabled: false, level: 0 };
    return acc;
  }, {} as ModuleSelectionState);
}

function getModuleSelectValue(selection: ModuleSelectionState[ModuleKey]): ModuleSelectValue {
  if (!selection.enabled) {
    return 'none';
  }

  return String(selection.level) as Exclude<ModuleSelectValue, 'none'>;
}

function getPermissionLabel(permission: UserPermission): string {
  return (
    CREATE_USER_PERMISSION_OPTIONS.find((option) => option.value === permission)?.label ??
    'Acesso pelo departamento'
  );
}

export function CreateUserModal({
  isOpen,
  onClose,
  onUserCreated,
  departments = [],
  departmentsLoading = false,
  departmentsError = false,
  onRetryDepartments,
  organizationId,
  organizationIdLoading = false,
  invitedBy,
  canCreateOrganizationOwner = false,
}: CreateUserModalProps) {
  const [formData, setFormData] = useState(INITIAL_FORM_DATA);
  const [moduleSelections, setModuleSelections] = useState<ModuleSelectionState>(createInitialModuleSelections);
  const [isLoading, setIsLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const isCreateBlocked = departmentsLoading || departmentsError || departments.length === 0 || organizationIdLoading || !organizationId;
  const selectedDepartmentName = useMemo(() => {
    if (!formData.department_id) {
      return null;
    }

    return departments.find((department) => department.id === formData.department_id)?.name ?? null;
  }, [departments, formData.department_id]);
  const departmentModuleKey = useMemo(
    () => resolveDepartmentModuleKey(selectedDepartmentName),
    [selectedDepartmentName],
  );
  const effectiveIsOrganizationOwner =
    canCreateOrganizationOwner && formData.isOrganizationOwner;
  const departmentPermissionLabel = getPermissionLabel(formData.departmentPermission);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setSubmitError(null);
    setFormData((prev) => {
      if (name === 'departmentPermission') {
        return {
          ...prev,
          departmentPermission: Number(value) as UserPermission,
        };
      }

      return {
        ...prev,
        [name]: value,
      };
    });
  };

  const handleOrganizationOwnerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSubmitError(null);
    setFormData((prev) => ({
      ...prev,
      isOrganizationOwner: canCreateOrganizationOwner && e.target.checked,
    }));
  };

  const handleModuleLevelChange = (moduleKey: ModuleKey, value: ModuleSelectValue) => {
    setSubmitError(null);
    setModuleSelections((prev) => ({
      ...prev,
      [moduleKey]: {
        enabled: value !== 'none',
        level: value === 'none' ? 0 : Number(value) as 0 | 1 | 2,
      },
    }));
  };

  const handleCadastrar = async () => {
    setSubmitError(null);

    if (!formData.name || !formData.login || !formData.password || !formData.department_id) {
      toast.warn('Preencha todos os campos obrigatórios!');
      return;
    }

    if (organizationIdLoading) {
      toast.info('Carregando o contexto da organização. Tente novamente em instantes.');
      return;
    }

    if (!organizationId) {
      toast.error('Não foi possível identificar a organização do usuário logado. Recarregue a página e tente novamente.');
      return;
    }

    setIsLoading(true);

    try {
      const { userService } = await import('../services/userService');
      const payload = buildAdminCreateUserPayload({
        formData,
        moduleSelections,
        departmentModuleKey,
        organizationId,
        invitedBy,
        canCreateOrganizationOwner,
      });

      const newUser = await userService.create(payload);
      toast.success('Usuário cadastrado com sucesso!');
      onUserCreated(newUser);
      onClose();
      setFormData(INITIAL_FORM_DATA);
      setModuleSelections(createInitialModuleSelections());
    } catch (err) {
      setSubmitError('Não foi possível concluir o cadastro com os dados informados.');
      toast.error('Erro ao cadastrar usuário.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          setSubmitError(null);
          onClose();
        }
      }}
      title="Cadastrar Novo Usuário"
      description="Formulário para cadastro de novo usuário"
      contentClassName="admin-users-modal flex max-h-[90vh] flex-col overflow-hidden border border-slate-200 bg-white shadow-2xl sm:max-h-[88vh] dark:border-slate-700 dark:bg-slate-900"
      bodyClassName="overflow-y-auto"
      footer={(
        <>
          <button
            type="button"
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            type="button"
            className={PRIMARY_ACTION_CLASSNAME}
            disabled={isLoading || isCreateBlocked}
            onClick={handleCadastrar}
          >
            {isLoading ? 'Salvando...' : 'Criar Usuário'}
          </button>
        </>
      )}
    >
      <div className="space-y-6">
        {submitError ? (
          <div className="rounded-2xl border border-rose-300 bg-rose-50/80 p-4 dark:border-rose-800 dark:bg-rose-950/20">
            <p className="text-sm font-medium text-rose-700 dark:text-rose-300">{submitError}</p>
          </div>
        ) : null}

        {departmentsError ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-950/40">
            <p className="dialog-neutral-text text-sm font-medium text-slate-700 dark:text-white">
              Não foi possível carregar os departamentos. O cadastro foi bloqueado até a integração voltar.
            </p>
            {onRetryDepartments ? (
              <button
                type="button"
                onClick={onRetryDepartments}
                className="mt-3 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Tentar novamente
              </button>
            ) : null}
          </div>
        ) : departmentsLoading ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-950/40">
            <p className="dialog-neutral-text text-sm font-medium text-slate-700 dark:text-white">
              Carregando departamentos para habilitar o cadastro.
            </p>
          </div>
        ) : !organizationIdLoading && departments.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-950/40">
            <p className="dialog-neutral-text text-sm font-medium text-slate-700 dark:text-white">
              Nenhum departamento disponível. O cadastro depende dos dados retornados pelo backend.
            </p>
            {onRetryDepartments ? (
              <button
                type="button"
                onClick={onRetryDepartments}
                className="mt-3 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Atualizar lista
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="md:col-span-3">
              <label htmlFor="user-name" className={FIELD_LABEL_CLASSNAME}>Nome</label>
              <input id="user-name" name="name" value={formData.name} onChange={handleInputChange} className={FIELD_CLASSNAME} required />
            </div>
            <div className="md:col-span-2">
              <label htmlFor="user-login" className={FIELD_LABEL_CLASSNAME}>Login</label>
              <input id="user-login" name="login" value={formData.login} onChange={handleInputChange} className={FIELD_CLASSNAME} required />
            </div>
            <div className="md:col-span-1">
              <label htmlFor="user-password" className={FIELD_LABEL_CLASSNAME}>Senha</label>
              <input id="user-password" type="password" name="password" value={formData.password} onChange={handleInputChange} className={FIELD_CLASSNAME} required />
            </div>
          </div>

          <div className={`grid grid-cols-1 gap-4 ${canCreateOrganizationOwner ? 'md:grid-cols-[minmax(0,1fr)_196px_160px]' : 'md:grid-cols-[minmax(0,1fr)_220px]'}`}>
            <div>
              <label htmlFor="user-department" className={FIELD_LABEL_CLASSNAME}>Departamento</label>
              <select
                id="user-department"
                name="department_id"
                value={formData.department_id}
                onChange={handleInputChange}
                className={SELECT_FIELD_CLASSNAME}
                style={SELECT_ARROW_STYLE}
                disabled={departmentsLoading || departmentsError || departments.length === 0}
                required
              >
                <option value="">Selecione um departamento</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>{department.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="user-permission" className={FIELD_LABEL_CLASSNAME}>Permissão</label>
              <select
                id="user-permission"
                name="departmentPermission"
                value={formData.departmentPermission}
                onChange={handleInputChange}
                className={SELECT_FIELD_CLASSNAME}
                style={SELECT_ARROW_STYLE}
              >
                {CREATE_USER_PERMISSION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            {canCreateOrganizationOwner ? (
              <div className="flex h-full flex-col justify-end">
                <div className="flex h-[42px] items-center justify-center gap-3">
                  <label htmlFor="user-owner-scope" className={`${FIELD_LABEL_CLASSNAME} mb-0`}>Adm. global</label>
                  <input
                    id="user-owner-scope"
                    type="checkbox"
                    checked={effectiveIsOrganizationOwner}
                    onChange={handleOrganizationOwnerChange}
                    aria-label="Administrador global"
                    className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-blue-600 accent-[var(--colors-brand-gradient-end)] outline-none transition-all focus:ring-2 focus:ring-[var(--colors-brand-gradient-start)]/30"
                  />
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <section className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-950/40">
          <div className="mb-4 space-y-1">
            <label className={SECTION_TITLE_CLASSNAME}>Módulos adicionais</label>
            <p className={SECTION_DESCRIPTION_CLASSNAME}>
              Defina apenas acessos complementares fora do departamento principal.
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              O módulo da área principal recebe a permissão definida no departamento.
            </p>
          </div>
          <div className="max-h-[320px] space-y-3 overflow-y-auto pr-1">
            {CREATE_USER_MODULE_OPTIONS.map((moduleOption) => {
              const selection = moduleSelections[moduleOption.key];
              const isDepartmentModule = departmentModuleKey === moduleOption.key;

              return (
                <div key={moduleOption.key} className={MODULE_CARD_CLASSNAME}>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_180px] md:items-center">
                    <div className="min-w-0">
                      <p className="dialog-neutral-text truncate text-sm font-medium text-slate-700 dark:text-white">{moduleOption.label}</p>
                    </div>
                    {isDepartmentModule ? (
                      <div className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 bg-slate-100 px-3 text-sm font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {`Departamento: ${departmentPermissionLabel}`}
                      </div>
                    ) : (
                      <select
                        value={getModuleSelectValue(selection)}
                        onChange={(e) => handleModuleLevelChange(moduleOption.key, e.target.value as ModuleSelectValue)}
                        disabled={effectiveIsOrganizationOwner}
                        className={`${SELECT_FIELD_CLASSNAME} h-10 px-3 text-sm`}
                        style={SELECT_ARROW_STYLE}
                      >
                        <option value="none">Sem acesso</option>
                        <option value="0">Visualizador</option>
                        <option value="1">Usuário</option>
                        <option value="2">Administrador</option>
                      </select>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </Dialog>
  );
}
