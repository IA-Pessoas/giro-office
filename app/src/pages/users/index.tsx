import React, { useMemo, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { isAxiosError } from "axios";
import { toast } from "react-toastify";
import { FaUsers } from "react-icons/fa";

import { canAccessAdministration, canSSRAdmin } from "@modules/auth";
import { departmentService, type DepItem } from "@modules/departments";
import {
  CreateUserModal,
  UserDetailsView,
  UserFilters,
  UserList,
  userService,
  type UserItem,
} from "@modules/users";
import { extractUsersList } from "@modules/users/services/userService";
import { AdminAccessDeniedState } from "@shared/components/AdminAccessDeniedState";
import { setupAPIClient } from "@shared/services/api";

interface Props {
  users?: UserItem[];
  deps?: DepItem[];
  me?: any;
  forbidden?: boolean;
}

export default function Users({ users = [], deps = [], me, forbidden = false }: Props) {
  const router = useRouter();
  const [usersList, setUsersList] = useState<UserItem[]>(users);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("Ativo");
  const [isListLoading, setIsListLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const hasAdminAccess = canAccessAdministration(me);

  const onModalOpen = () => setIsModalOpen(true);
  const onModalClose = () => setIsModalOpen(false);
  const isDesktopListCollapsed = !!selectedUserId;

  const filteredUsers = useMemo(() => {
    return usersList.filter((user) => user.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [usersList, searchTerm]);

  const handleUserCreated = (newUser: UserItem) => {
    if (filterStatus === "Ativo") {
      setUsersList((currentUsers) => [newUser, ...currentUsers]);
      return;
    }

    toast.info(`Usuário ${newUser.name} criado, mude o filtro para "Ativo" para vê-lo.`);
  };

  const handleFilterChange = async (status: string) => {
    setIsListLoading(true);
    try {
      const nextUsers = await userService.list({ status });
      setUsersList(nextUsers);
      setFilterStatus(status);
      toast.success(`Filtro "${status}" aplicado.`);
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 403) {
        await router.replace("/dashboard");
        return;
      }

      toast.error("Erro ao buscar usuários.");
    } finally {
      setIsListLoading(false);
    }
  };

  if (forbidden) {
    return (
      <>
        <Head>
          <title>Usuários</title>
        </Head>
        <AdminAccessDeniedState description="Você não possui permissão para acessar a área de usuários." />
      </>
    );
  }

  if (!hasAdminAccess) {
    return null;
  }

  return (
    <>
      <Head>
        <title>Usuários</title>
      </Head>

      <section className="users-shell u-split-panel relative">
        <aside
          className={`users-sidebar group relative z-20 flex flex-col items-center justify-center overflow-hidden transition-all duration-300 md:h-[90vh] ${isDesktopListCollapsed ? "md:absolute md:w-[80px] md:min-w-[80px]" : "md:w-[350px] md:min-w-[350px]"}`}
        >
          <div
            className={`absolute hidden h-20 w-20 items-center justify-center transition-opacity md:flex ${isDesktopListCollapsed ? "opacity-100 group-hover:opacity-0" : "opacity-0"}`}
          >
            <FaUsers size={28} color="var(--colors-blue-500)" />
          </div>

          <div
            className={`h-full w-full transition-opacity duration-300 md:w-[350px] ${isDesktopListCollapsed ? "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100" : "opacity-100"}`}
          >
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
              <UserList users={filteredUsers} onUserSelect={setSelectedUserId} />
            )}
          </div>
        </aside>

        <section
          className={`flex-1 transition-all duration-300 ${isDesktopListCollapsed ? "md:pl-[80px]" : "md:pl-0"}`}
        >
          <UserDetailsView userId={selectedUserId} me={me} departments={deps} />
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

export const getServerSideProps = canSSRAdmin<Props>(
  async (ctx) => {
    try {
      const apiClient = setupAPIClient(ctx);
      const [meResponse, usersResponse, deps] = await Promise.all([
        apiClient.get("/user/me"),
        apiClient.get("/user/users", { params: { status: "Ativo" } }),
        departmentService.list(undefined, ctx),
      ]);

      return {
        props: {
          me: meResponse.data.user,
          users: extractUsersList(usersResponse.data),
          deps,
        },
      };
    } catch (error) {
      console.error("Erro no getServerSideProps da página de usuários:", error);
      return { redirect: { destination: "/dashboard", permanent: false } };
    }
  },
  {
    onForbidden: () => ({
      props: {
        forbidden: true,
      },
    }),
  },
);
