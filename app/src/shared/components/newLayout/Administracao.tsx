import { useState } from "react";
import { Shield, Users, KeyRound, FileSearch, Plus } from "lucide-react";

import { departmentService } from "@modules/departments";
import { CreateUserModal, userService, type UserItem } from "@modules/users";
import { useFetch } from "@shared/hooks";

export function Administracao() {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const { data: departments = [] } = useFetch(["departments"], () => departmentService.list());
  const { data: users = [], refetch: refetchUsers } = useFetch(["users"], () => userService.list());

  const handleOpenCreateModal = () => setIsCreateModalOpen(true);
  const handleCloseCreateModal = () => setIsCreateModalOpen(false);
  const handleUserCreated = (_user: UserItem) => {
    void refetchUsers();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Shield className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            Administração
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Configurações do sistema, usuários e permissões
          </p>
        </div>
        <button
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
          type="button"
          onClick={handleOpenCreateModal}
        >
          <Plus className="w-4 h-4" />
          Novo Usuário
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Usuários Ativos</p>
              <p className="text-2xl font-semibold text-gray-900 dark:text-white">{users.length}</p>
            </div>
            <Users className="w-5 h-5 text-indigo-600 dark:text-indigo-400 flex-shrink-0" />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Perfis de Acesso</p>
              <p className="text-2xl font-semibold text-gray-900 dark:text-white">12</p>
            </div>
            <KeyRound className="w-5 h-5 text-indigo-600 dark:text-indigo-400 flex-shrink-0" />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Logs de Auditoria</p>
              <p className="text-2xl font-semibold text-gray-900 dark:text-white">1.543</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Últimos 30 dias</p>
            </div>
            <FileSearch className="w-5 h-5 text-indigo-600 dark:text-indigo-400 flex-shrink-0" />
          </div>
        </div>
      </div>

      <CreateUserModal
        isOpen={isCreateModalOpen}
        onClose={handleCloseCreateModal}
        onUserCreated={handleUserCreated}
        departments={departments}
      />
    </div>
  );
}
