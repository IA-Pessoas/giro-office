import React, { useState } from 'react';
import { toast } from 'react-toastify';
import { setupAPIClient } from '@shared/services/api';
import { Dialog } from '@shared/components';
import type { UserItem } from '../types';
import type { DepItem } from '@modules/departments';

interface CreateUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUserCreated: (newUser: UserItem) => void;
  departments: DepItem[];
}

export function CreateUserModal({ isOpen, onClose, onUserCreated, departments }: CreateUserModalProps) {
  const [formData, setFormData] = useState({ name: '', login: '', password: '', department_id: '', permission: 0 });
  const [isLoading, setIsLoading] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: name === 'permission' ? parseInt(value) : value }));
  };

  const handleCadastrar = async () => {
    if (!formData.name || !formData.login || !formData.password || !formData.department_id) {
      toast.warn('Preencha todos os campos obrigatórios!');
      return;
    }
    setIsLoading(true);
    try {
      const { userService } = await import('../services/userService');
      const newUser = await userService.create(formData);
      toast.success("Usuário cadastrado com sucesso!");
      onUserCreated(newUser); // Notifica a página pai com o novo usuário
      onClose(); // Fecha o modal
      setFormData({ name: '', login: '', password: '', department_id: '', permission: 0 }); // Limpa o formulário
    } catch (err) {
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
        if (!open) onClose();
      }}
      title="Cadastrar Novo Usuário"
      footer={(
        <>
          <button type="button" className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100" onClick={onClose}>
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
          <label htmlFor="user-name" className="text-sm font-medium text-[var(--colors-blue-500)]">Nome</label>
          <input id="user-name" name="name" value={formData.name} onChange={handleInputChange} className="ui-input" required />
        </div>
        <div className="u-stack u-gap-2">
          <label htmlFor="user-login" className="text-sm font-medium text-[var(--colors-blue-500)]">Login</label>
          <input id="user-login" name="login" value={formData.login} onChange={handleInputChange} className="ui-input" required />
        </div>
        <div className="u-stack u-gap-2">
          <label htmlFor="user-password" className="text-sm font-medium text-[var(--colors-blue-500)]">Senha</label>
          <input id="user-password" type="password" name="password" value={formData.password} onChange={handleInputChange} className="ui-input" required />
        </div>
        <div className="u-stack u-gap-2">
          <label htmlFor="user-department" className="text-sm font-medium text-[var(--colors-blue-500)]">Departamento</label>
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
      </div>
    </Dialog>
  );
}