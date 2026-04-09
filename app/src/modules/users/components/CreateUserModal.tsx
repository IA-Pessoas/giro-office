import React, { useState } from 'react';
import { toast } from 'react-toastify';

import { Dialog } from '@shared/components';

import {
  CREATE_USER_MODULE_OPTIONS,
  CREATE_USER_PERMISSION_OPTIONS,
} from '../constants/createUserConfig';
import type { AdminCreateUserData, UserItem, UserPermission, UserType } from '../types';

interface CreateUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUserCreated: (newUser: UserItem) => void;
  departments?: ReadonlyArray<{ id: string; name: string }>;
  organizationId?: string;
  organizationIdLoading?: boolean;
  invitedBy?: string;
}

const INITIAL_FORM_DATA: {
  name: string;
  login: string;
  password: string;
  department_id: string;
  permission: UserPermission;
} = {
  name: '',
  login: '',
  password: '',
  department_id: '',
  permission: 0,
};

type ModuleKey = (typeof CREATE_USER_MODULE_OPTIONS)[number]['key'];

type ModuleSelectionState = Record<ModuleKey, { enabled: boolean; level: 0 | 1 | 2 }>;
type ModuleSelectValue = 'none' | '0' | '1' | '2';

const FIELD_CLASSNAME =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm transition-all outline-none placeholder:text-slate-400 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 disabled:cursor-not-allowed disabled:opacity-80';

const MODULE_CARD_CLASSNAME =
  'rounded-2xl border border-slate-200 bg-slate-50/90 p-3 dark:border-slate-700 dark:bg-slate-800/70';

function createInitialModuleSelections(): ModuleSelectionState {
  return CREATE_USER_MODULE_OPTIONS.reduce((acc, moduleOption) => {
    acc[moduleOption.key] = { enabled: false, level: 0 };
    return acc;
  }, {} as ModuleSelectionState);
}

function buildModulesPayload(moduleSelections: ModuleSelectionState) {
  return Object.entries(moduleSelections).reduce<Record<string, number | null>>((acc, [key, config]) => {
    if (config.enabled) {
      acc[key] = config.level;
    }
    return acc;
  }, {});
}

function getUserTypeFromPermission(permission: UserPermission): UserType {
  switch (permission) {
    case 1:
      return 'admin';
    case 2:
      return 'owner';
    case 0:
    default:
      return 'user';
  }
}

function getModuleSelectValue(selection: ModuleSelectionState[ModuleKey]): ModuleSelectValue {
  if (!selection.enabled) {
    return 'none';
  }

  return String(selection.level) as Exclude<ModuleSelectValue, 'none'>;
}

export function CreateUserModal({
  isOpen,
  onClose,
  onUserCreated,
  departments = [],
  organizationId,
  organizationIdLoading = false,
  invitedBy,
}: CreateUserModalProps) {
  const [formData, setFormData] = useState(INITIAL_FORM_DATA);
  const [moduleSelections, setModuleSelections] = useState<ModuleSelectionState>(createInitialModuleSelections);
  const [isLoading, setIsLoading] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'permission' ? Number(value) as UserPermission : value,
    }));
  };

  const handleModuleLevelChange = (moduleKey: ModuleKey, value: ModuleSelectValue) => {
    setModuleSelections((prev) => ({
      ...prev,
      [moduleKey]: {
        enabled: value !== 'none',
        level: value === 'none' ? 0 : Number(value) as 0 | 1 | 2,
      },
    }));
  };

  const handleCadastrar = async () => {
    if (!formData.name || !formData.login || !formData.password || !formData.department_id) {
      toast.warn('Preencha todos os campos obrigatorios!');
      return;
    }

    if (organizationIdLoading) {
      toast.info('Carregando o contexto da organizacao. Tente novamente em instantes.');
      return;
    }

    if (!organizationId) {
      toast.error('Nao foi possivel identificar a organizacao do usuario logado. Recarregue a pagina e tente novamente.');
      return;
    }

    setIsLoading(true);

    try {
      const { userService } = await import('../services/userService');
      const type = getUserTypeFromPermission(formData.permission);
      const modules = buildModulesPayload(moduleSelections);
      const payload: AdminCreateUserData = {
        name: formData.name,
        login: formData.login,
        password: formData.password,
        department_id: formData.department_id,
        permission: formData.permission,
        organization_id: organizationId,
        type,
        status: 'active',
        ...(type !== 'owner' && Object.keys(modules).length > 0 ? { modules } : {}),
        ...(invitedBy ? { invited_by: invitedBy } : {}),
        ...(type === 'owner' ? { first_owner_flag: true } : {}),
      };

      const newUser = await userService.create(payload);
      toast.success('Usuario cadastrado com sucesso!');
      onUserCreated(newUser);
      onClose();
      setFormData(INITIAL_FORM_DATA);
      setModuleSelections(createInitialModuleSelections());
    } catch (err) {
      toast.error('Erro ao cadastrar usuario.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Cadastrar Novo Usuario"
      description="Formulario para cadastro de novo usuario"
      contentClassName="flex max-h-[90vh] flex-col overflow-hidden border border-slate-200 bg-white shadow-2xl sm:max-h-[88vh] dark:border-slate-700 dark:bg-slate-900"
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
            className="rounded-xl bg-gradient-to-r from-violet-600 to-purple-700 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-violet-950/20 transition-all hover:from-violet-700 hover:to-purple-800 disabled:cursor-not-allowed disabled:opacity-70"
            disabled={isLoading}
            onClick={handleCadastrar}
          >
            {isLoading ? 'Salvando...' : 'Criar Usuario'}
          </button>
        </>
      )}
    >
      <div className="space-y-6">
        <div className="space-y-1">
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Novo Usuario</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Preencha os dados principais e configure o acesso por modulo sem alterar as regras atuais do sistema.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="md:col-span-3">
            <label htmlFor="user-name" className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">Nome</label>
            <input id="user-name" name="name" value={formData.name} onChange={handleInputChange} className={FIELD_CLASSNAME} required />
          </div>
          <div>
            <label htmlFor="user-login" className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">Login</label>
            <input id="user-login" name="login" value={formData.login} onChange={handleInputChange} className={FIELD_CLASSNAME} required />
          </div>
          <div className="md:col-span-2">
            <label htmlFor="user-password" className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">Senha</label>
            <input id="user-password" type="password" name="password" value={formData.password} onChange={handleInputChange} className={FIELD_CLASSNAME} required />
          </div>
          <div className="md:col-span-2">
            <label htmlFor="user-department" className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">Departamento</label>
            <select
              id="user-department"
              name="department_id"
              value={formData.department_id}
              onChange={handleInputChange}
              className={FIELD_CLASSNAME}
              required
            >
              <option value="">Selecione um departamento</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>{department.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="user-permission" className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">Permissao</label>
            <select
              id="user-permission"
              name="permission"
              value={formData.permission}
              onChange={handleInputChange}
              className={FIELD_CLASSNAME}
            >
              {CREATE_USER_PERMISSION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
        </div>

        <section className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-950/40">
          <div className="mb-4 space-y-1">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Modulos adicionais</label>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Defina o nivel de acesso por modulo. Selecoes em &quot;Sem acesso&quot; nao entram no payload.
            </p>
          </div>
          <div className="max-h-[320px] space-y-3 overflow-y-auto pr-1">
            {CREATE_USER_MODULE_OPTIONS.map((moduleOption) => {
              const selection = moduleSelections[moduleOption.key];

              return (
                <div key={moduleOption.key} className={MODULE_CARD_CLASSNAME}>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_180px] md:items-center">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">{moduleOption.label}</p>
                    </div>
                    <select
                      value={getModuleSelectValue(selection)}
                      onChange={(e) => handleModuleLevelChange(moduleOption.key, e.target.value as ModuleSelectValue)}
                      disabled={formData.permission === 2}
                      className={`${FIELD_CLASSNAME} h-10 px-3 text-sm`}
                    >
                      <option value="none">Sem acesso</option>
                      <option value="0">Visualizador</option>
                      <option value="1">Usuario</option>
                      <option value="2">Administrador</option>
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
          {formData.permission === 2 ? (
            <p className="pt-1 text-xs text-slate-500 dark:text-slate-400">
              Owner recebe acesso amplo pelo backend; as selecoes de modulos adicionais nao sao enviadas neste caso.
            </p>
          ) : null}
        </section>
      </div>
    </Dialog>
  );
}
