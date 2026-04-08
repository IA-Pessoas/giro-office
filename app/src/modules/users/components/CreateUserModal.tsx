import React, { useState } from 'react';
import { toast } from 'react-toastify';

import { Dialog } from '@shared/components';
import type { DepItem } from '@modules/departments';

import type { AdminCreateUserData, UserItem, UserPermission, UserType } from '../types';

interface CreateUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUserCreated: (newUser: UserItem) => void;
  departments: DepItem[];
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

const PERMISSION_OPTIONS: Array<{ value: UserPermission; label: string }> = [
  { value: 0, label: 'User' },
  { value: 1, label: 'Admin' },
  { value: 2, label: 'Owner' },
];

const MODULE_PERMISSION_OPTIONS = [0, 1, 2] as const;

const MODULE_OPTIONS = [
  { key: 'atendimento', label: 'Atendimento' },
  { key: 'certificado', label: 'Certificado' },
  { key: 'comercial', label: 'Comercial' },
  { key: 'contabil', label: 'Contabil' },
  { key: 'financeiro', label: 'Financeiro' },
  { key: 'fiscal', label: 'Fiscal' },
  { key: 'integracao', label: 'Integracao' },
  { key: 'marketing', label: 'Marketing' },
  { key: 'parcelamento', label: 'Parcelamento' },
  { key: 'pec', label: 'PEC' },
  { key: 'pessoal', label: 'Pessoal' },
  { key: 'regularize', label: 'Regularize' },
  { key: 'rh', label: 'RH' },
  { key: 'triagem', label: 'Triagem' },
  { key: 'wiki', label: 'Wiki' },
] as const;

type ModuleKey = (typeof MODULE_OPTIONS)[number]['key'];

type ModuleSelectionState = Record<ModuleKey, { enabled: boolean; level: 0 | 1 | 2 }>;

const FIELD_CLASSNAME =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition-colors outline-none placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-80';

const MODULE_CARD_CLASSNAME =
  'rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60';

function createInitialModuleSelections(): ModuleSelectionState {
  return MODULE_OPTIONS.reduce((acc, moduleOption) => {
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

export function CreateUserModal({
  isOpen,
  onClose,
  onUserCreated,
  departments,
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

  const handleModuleToggle = (moduleKey: ModuleKey) => {
    setModuleSelections((prev) => ({
      ...prev,
      [moduleKey]: {
        ...prev[moduleKey],
        enabled: !prev[moduleKey].enabled,
      },
    }));
  };

  const handleModuleLevelChange = (moduleKey: ModuleKey, value: string) => {
    setModuleSelections((prev) => ({
      ...prev,
      [moduleKey]: {
        ...prev[moduleKey],
        level: Number(value) as 0 | 1 | 2,
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
      contentClassName="flex max-h-[90vh] flex-col overflow-hidden sm:max-h-[88vh]"
      bodyClassName="overflow-y-auto"
      footer={(
        <>
          <button
            type="button"
            className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100"
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="ui-button-primary"
            disabled={isLoading}
            onClick={handleCadastrar}
          >
            {isLoading ? 'Salvando...' : 'Salvar'}
          </button>
        </>
      )}
    >
      <div className="u-stack u-gap-4">
        <div className="u-stack u-gap-2">
          <label htmlFor="user-name" className="users-section-title">Nome</label>
          <input id="user-name" name="name" value={formData.name} onChange={handleInputChange} className={FIELD_CLASSNAME} required />
        </div>
        <div className="u-stack u-gap-2">
          <label htmlFor="user-login" className="users-section-title">Login</label>
          <input id="user-login" name="login" value={formData.login} onChange={handleInputChange} className={FIELD_CLASSNAME} required />
        </div>
        <div className="u-stack u-gap-2">
          <label htmlFor="user-password" className="users-section-title">Senha</label>
          <input id="user-password" type="password" name="password" value={formData.password} onChange={handleInputChange} className={FIELD_CLASSNAME} required />
        </div>
        <div className="u-stack u-gap-2">
          <label htmlFor="user-department" className="users-section-title">Departamento</label>
          <select
            id="user-department"
            name="department_id"
            value={formData.department_id}
            onChange={handleInputChange}
            className={FIELD_CLASSNAME}
            required
          >
            <option value="">Selecione um departamento</option>
            {departments.map((dep) => <option key={dep.id} value={dep.id}>{dep.name}</option>)}
          </select>
        </div>
        <div className="u-stack u-gap-2">
          <label htmlFor="user-permission" className="users-section-title">Permissao</label>
          <select
            id="user-permission"
            name="permission"
            value={formData.permission}
            onChange={handleInputChange}
            className={FIELD_CLASSNAME}
          >
            {PERMISSION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
        <div className="u-stack u-gap-2">
          <div>
            <label className="users-section-title">Modulos adicionais</label>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Acesso complementar por modulo. O departamento principal continua sendo definido acima.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:gap-3 lg:grid-cols-2">
            {MODULE_OPTIONS.map((moduleOption) => {
              const selection = moduleSelections[moduleOption.key];

              return (
                <div key={moduleOption.key} className={MODULE_CARD_CLASSNAME}>
                  <div className="grid grid-cols-[minmax(0,1fr)_88px] items-center gap-3">
                    <label className="flex min-w-0 items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                      <input
                        type="checkbox"
                        checked={selection.enabled}
                        onChange={() => handleModuleToggle(moduleOption.key)}
                        disabled={formData.permission === 2}
                        className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-500 dark:bg-slate-900"
                      />
                      <span className="truncate">{moduleOption.label}</span>
                    </label>
                    <select
                      value={selection.level}
                      onChange={(e) => handleModuleLevelChange(moduleOption.key, e.target.value)}
                      disabled={!selection.enabled || formData.permission === 2}
                      className={`${FIELD_CLASSNAME} h-9 w-[88px] min-w-[88px] px-2 py-1 text-xs`}
                    >
                      {MODULE_PERMISSION_OPTIONS.map((level) => (
                        <option key={level} value={level}>{level}</option>
                      ))}
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
          {formData.permission === 2 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Owner recebe acesso amplo pelo backend; as selecoes de modulos adicionais nao sao enviadas neste caso.
            </p>
          ) : null}
        </div>
      </div>
    </Dialog>
  );
}
