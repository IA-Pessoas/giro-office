import React, { useState, useMemo } from 'react';
import Head from 'next/head';
import { toast } from "react-toastify";
import { FaUsers } from 'react-icons/fa';

import { canSSRAuth } from '@modules/auth';
import { setupAPIClient } from '@shared/services/api';
import { UserFilters, UserList, CreateUserModal, UserDetailsView, userService, type UserItem } from '@modules/users';
import type { DepItem } from '@modules/departments';

interface Props { users: UserItem[]; deps: DepItem[]; me: any; }

export default function Users({ users, deps, me }: Props) {
  const [usersList, setUsersList] = useState<UserItem[]>(users || []);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('Ativo');
  const [isListLoading, setIsListLoading] = useState(false);

  // Controle do Modal sem Chakra
  const [isModalOpen, setIsModalOpen] = useState(false);
  const onModalOpen = () => setIsModalOpen(true);
  const onModalClose = () => setIsModalOpen(false);

  const isDesktopListCollapsed = !!selectedUserId;

  const filteredUsers = useMemo(() => {
    return usersList.filter(user =>
      user.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [usersList, searchTerm]);

  // Funções de Callback
  const handleUserCreated = (newUser: UserItem) => {
    // Adiciona o novo usuário no topo da lista se o filtro atual for 'Ativo'
    if (filterStatus === 'Ativo') {
      setUsersList(currentUsers => [newUser, ...currentUsers]);
    } else {
      toast.info(`Usuário ${newUser.name} criado, mude o filtro para 'Ativos' para vê-lo.`);
    }
  };
  const handleFilterChange = async (status: string) => {
    setIsListLoading(true);
    try {
      const users = await userService.list({ status });
      setUsersList(users);
      setFilterStatus(status);
      toast.success(`Filtro '${status}' aplicado.`);
    } catch (error) {
      toast.error("Erro ao buscar usuários.");
    } finally {
      setIsListLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>Usuários</title>
      </Head>

      <section className="users-shell u-split-panel relative">
          <aside
            className={`users-sidebar group relative z-20 flex flex-col items-center justify-center overflow-hidden transition-all duration-300 md:h-[90vh] ${isDesktopListCollapsed ? 'md:absolute md:w-[80px] md:min-w-[80px]' : 'md:w-[350px] md:min-w-[350px]'}`}
          >
            <div className={`absolute hidden h-20 w-20 items-center justify-center transition-opacity md:flex ${isDesktopListCollapsed ? 'opacity-100 group-hover:opacity-0' : 'opacity-0'}`}>
              <FaUsers size={28} color="var(--colors-blue-500)" />
            </div>

            <div className={`h-full w-full transition-opacity duration-300 md:w-[350px] ${isDesktopListCollapsed ? 'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto' : 'opacity-100'}`}>
              <UserFilters
                initialStatus={filterStatus}
                onFilterChange={handleFilterChange}
                onSearchChange={setSearchTerm}
                onOpenCreateModal={onModalOpen}
              />
              {isListLoading ? (
                <div className="u-flex h-[150px] items-center justify-center">
                  <span className="text-sm text-slate-500">Carregando...</span>
                </div>
              ) : (
                <UserList
                  users={filteredUsers}
                  onUserSelect={setSelectedUserId}
                />
              )}
            </div>
          </aside>

          <section className={`flex-1 transition-all duration-300 ${isDesktopListCollapsed ? 'md:pl-[80px]' : 'md:pl-0'}`}>
            {/* Passamos as novas props aqui */}
            <UserDetailsView 
                userId={selectedUserId} 
                me={me} 
                departments={deps} 
            />
          </section>
      </section>

      <CreateUserModal
        isOpen={isModalOpen}
        onClose={onModalClose}
        onUserCreated={handleUserCreated}
        departments={deps}
      />
    </>
  );
}

export const getServerSideProps = canSSRAuth(async (ctx) => {
  try {
    const apiClient = setupAPIClient(ctx);
    const [meResponse, usersResponse, depsResponse] = await Promise.all([
      apiClient.get('/user/me'),
      apiClient.get('/user/users', { params: { status: 'Ativo' } }),
      apiClient.get('/departments')
    ]);

    if (meResponse.data.user.permission === 0) {
      return { redirect: { destination: '/dashboard', permanent: false } };
    }

    return {
      props: {
        me: meResponse.data.user,
        users: usersResponse.data,
        deps: depsResponse.data,
      }
    };
  } catch (error) {
    console.error("Erro no getServerSideProps da página de usuários:", error);
    return { redirect: { destination: '/dashboard', permanent: false } };
  }
});
