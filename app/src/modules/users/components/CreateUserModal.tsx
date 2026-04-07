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
  const [isLoading, setIsLoading] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'permission' ? Number(value) as UserPermission : value,
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
      const payload: AdminCreateUserData = {
        name: formData.name,
        login: formData.login,
        password: formData.password,
        department_id: formData.department_id,
        permission: formData.permission,
        organization_id: organizationId,
        type,
        status: 'active',
        ...(invitedBy ? { invited_by: invitedBy } : {}),
        ...(type === 'owner' ? { first_owner_flag: true } : {}),
      };

      const newUser = await userService.create(payload);
      toast.success('Usuario cadastrado com sucesso!');
      onUserCreated(newUser);
      onClose();
      setFormData(INITIAL_FORM_DATA);
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
          <input id="user-name" name="name" value={formData.name} onChange={handleInputChange} className="ui-input" required />
        </div>
        <div className="u-stack u-gap-2">
          <label htmlFor="user-login" className="users-section-title">Login</label>
          <input id="user-login" name="login" value={formData.login} onChange={handleInputChange} className="ui-input" required />
        </div>
        <div className="u-stack u-gap-2">
          <label htmlFor="user-password" className="users-section-title">Senha</label>
          <input id="user-password" type="password" name="password" value={formData.password} onChange={handleInputChange} className="ui-input" required />
        </div>
        <div className="u-stack u-gap-2">
          <label htmlFor="user-department" className="users-section-title">Departamento</label>
          <select
            id="user-department"
            name="department_id"
            value={formData.department_id}
            onChange={handleInputChange}
            className="ui-input"
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
            className="ui-input"
          >
            {PERMISSION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
      </div>
    </Dialog>
  );
}
