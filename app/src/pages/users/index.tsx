import React, { useState, useMemo } from 'react';
import Head from 'next/head';
import { Box, Flex, useDisclosure, Spinner, Icon } from '@chakra-ui/react';
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

  // Controle do Modal
  const { isOpen: isModalOpen, onOpen: onModalOpen, onClose: onModalClose } = useDisclosure();

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

        <Flex
          direction={{ base: 'column', md: 'row' }}
          w="99%"
          h={{ md: "90vh" }}
          gap={3}
          position="relative"
        >
          <Flex
            direction="column"
            role="group"
            position={{ base: 'relative', md: isDesktopListCollapsed ? 'absolute' : 'relative' }}
            w={{ base: '100%', md: isDesktopListCollapsed ? '80px' : '350px' }}
            minW={{ md: isDesktopListCollapsed ? '80px' : '350px' }}
            h={{ base: 'auto', md: '90vh' }}
            zIndex="20"
            bg="componentColorDarkOnly"
            boxShadow="md"
            borderRadius="md"
            justifyContent={'center'}
            alignItems={'center'}
            transition="all 0.3s ease-in-out"
            _hover={{ w: { md: '350px' }, }}
            overflow="hidden"
          >
            <Flex
              position="absolute"
              w="80px" h="80px"
              align="center" justify="center"
              display={{ base: 'none', md: 'flex' }}
              opacity={isDesktopListCollapsed ? 1 : 0}
              pointerEvents="none"
              _groupHover={{ opacity: 0 }}
              transition="opacity 0.2s"
            >
              <Icon as={FaUsers} boxSize={7} color="primaryText" />
            </Flex>

            <Flex
              direction="column"
              w={{ base: '100%', md: '350px' }}
              h="100%"
              opacity={isDesktopListCollapsed ? 0 : 1}
              pointerEvents={isDesktopListCollapsed ? 'none' : 'auto'}
              _groupHover={{ opacity: 1, pointerEvents: 'auto' }}
              transition="opacity 0.3s ease-in-out"
              bg={'componentColorDarkOnly'}
            >
              <UserFilters
                initialStatus={filterStatus}
                onFilterChange={handleFilterChange}
                onSearchChange={setSearchTerm}
                onOpenCreateModal={onModalOpen}
              />
              {isListLoading ? (
                <Flex justify="center" align="center" h="150px"><Spinner size="xl" /></Flex>
              ) : (
                <UserList
                  users={filteredUsers}
                  onUserSelect={setSelectedUserId}
                />
              )}
            </Flex>
          </Flex>

          <Box
            flex="1"
            pl={{ base: 0, md: isDesktopListCollapsed ? '80px' : 0 }}
            transition="padding-left 0.3s ease-in-out"
          >
            {/* Passamos as novas props aqui */}
            <UserDetailsView 
                userId={selectedUserId} 
                me={me} 
                departments={deps} 
            />
          </Box>
        </Flex>

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
      apiClient.get('/me'),
      apiClient.get('/users', { params: { status: 'Ativo' } }),
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