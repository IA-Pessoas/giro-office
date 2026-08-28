import { Search, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { PaginationControls } from "@shared/components/ui/PaginationControls";
import { useDebouncedValue } from "@shared/hooks/useDebouncedValue";
import { Input } from "@shared/ui/newLayout/input";
import { CreateUserModal } from "@modules/users/components/CreateUserModal";
import type { UserItem } from "@modules/users/types";

import { usePlatformDepartments, usePlatformUserDetail, usePlatformUsers } from "../hooks/usePlatformUsers";
import { platformService } from "../services/platformService";
import type { PlatformOrganization, PlatformOrganizationUser } from "../types";

const PAGE_SIZE = 20;

function getProfileLabel(user: PlatformOrganizationUser): string {
  if (user.type === "owner") return "Proprietário";
  if (user.type === "admin") return "Administrador";
  if (user.type === "user") return "Usuário";
  return "Sem perfil";
}

export function PlatformUsersPanel({ organization }: { organization: PlatformOrganization }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const queryClient = useQueryClient();
  const debouncedSearch = useDebouncedValue(search.trim(), 300);
  const usersQuery = usePlatformUsers(organization.id, {
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
  });
  const users = usersQuery.data?.users ?? [];
  const total = usersQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const userDetailQuery = usePlatformUserDetail(organization.id, selectedUserId);
  const departmentsQuery = usePlatformDepartments(organization.id);
  const departmentName = departmentsQuery.data?.find(
    (department) => department.id === userDetailQuery.data?.department_id,
  )?.name;
  const createUserMutation = useMutation({
    mutationFn: (data: Parameters<typeof platformService.createUser>[1]) =>
      platformService.createUser(organization.id, data),
    onSuccess: async (user) => {
      setSelectedUserId(user.id);
      await queryClient.invalidateQueries({
        queryKey: ["platform", "organizations", organization.id, "users"],
      });
    },
  });

  useEffect(() => {
    setSelectedUserId(null);
  }, [organization.id]);

  useEffect(() => {
    if (!selectedUserId && users[0]) setSelectedUserId(users[0].id);
    if (selectedUserId && !users.some((user) => user.id === selectedUserId)) setSelectedUserId(null);
  }, [selectedUserId, users]);

  return (
    <section aria-labelledby="platform-users-title">
      <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-end sm:justify-between dark:border-slate-800">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-700 dark:text-blue-300">
            Tenant selecionado
          </p>
          <h2 className="mt-1 text-lg font-semibold text-slate-950 dark:text-white" id="platform-users-title">
            Usuários
          </h2>
        </div>
        <div className="flex w-full gap-2 sm:max-w-md">
        <div className="min-w-0 flex-1">
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-300" htmlFor="platform-user-search">
            Pesquisar usuário
          </label>
          <div className="relative mt-1.5">
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="bg-white pl-9 dark:bg-slate-950"
              id="platform-user-search"
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Nome ou login"
              type="search"
              value={search}
            />
          </div>
        </div>
          <button className="self-end rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600" onClick={() => setIsCreateOpen(true)} type="button">Criar usuário</button>
        </div>
      </div>

      <div className="min-h-[24rem] overflow-x-auto" aria-busy={usersQuery.isLoading || usersQuery.isFetching}>
        {usersQuery.isLoading ? (
          <div className="flex min-h-72 items-center justify-center text-sm text-slate-500" role="status">
            Carregando usuários...
          </div>
        ) : usersQuery.isError ? (
          <div className="m-4 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-100" role="alert">
            <p>Não foi possível carregar os usuários.</p>
            <button className="mt-3 font-semibold underline underline-offset-4" onClick={() => void usersQuery.refetch()} type="button">
              Tentar novamente
            </button>
          </div>
        ) : users.length === 0 ? (
          <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center">
            <UserRound aria-hidden="true" className="h-7 w-7 text-slate-400" />
            <p className="mt-3 text-sm font-semibold text-slate-900 dark:text-white">
              Nenhum usuário encontrado
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Esta página não retornou usuários para o filtro atual.
            </p>
          </div>
        ) : (
          <div className="grid gap-0 lg:grid-cols-[22rem_minmax(0,1fr)]">
          <div className="overflow-x-auto border-b border-slate-200 dark:border-slate-800 lg:border-b-0 lg:border-r">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-[0.1em] text-slate-500 dark:bg-slate-950/60 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3 font-semibold" scope="col">Pessoa</th>
                <th className="px-4 py-3 font-semibold" scope="col">Perfil</th>
                <th className="px-4 py-3 font-semibold" scope="col">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {users.map((user) => (
                <tr className="text-slate-700 dark:text-slate-200" key={user.id}>
                  <td className="px-4 py-3">
                    <button
                      aria-current={selectedUserId === user.id ? "true" : undefined}
                      className="w-full rounded-md text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                      onClick={() => setSelectedUserId(user.id)}
                      type="button"
                    >
                      <p className="font-semibold text-slate-950 dark:text-white">{user.name}</p>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{user.login}</p>
                    </button>
                  </td>
                  <td className="px-4 py-3">{getProfileLabel(user)}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold dark:bg-slate-800">
                      {user.status === "active" ? "Ativo" : user.status || "Sem status"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <aside aria-live="polite" className="min-h-72 p-5" aria-label="Detalhes do usuário">
            {!selectedUserId ? (
              <p className="text-sm text-slate-500">Selecione um usuário para consultar seus detalhes.</p>
            ) : userDetailQuery.isLoading ? (
              <p className="text-sm text-slate-500" role="status">Carregando detalhes do usuário...</p>
            ) : userDetailQuery.isError ? (
              <div role="alert" className="text-sm text-rose-900 dark:text-rose-100">
                <p>Não foi possível carregar os detalhes do usuário.</p>
                <button className="mt-3 font-semibold underline" onClick={() => void userDetailQuery.refetch()} type="button">Tentar novamente</button>
              </div>
            ) : userDetailQuery.data ? (
              <div className="space-y-4">
                <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Usuário selecionado</p><h3 className="mt-1 text-lg font-semibold text-slate-950 dark:text-white">{userDetailQuery.data.name}</h3></div>
                <dl className="space-y-3 text-sm"><div><dt className="text-slate-500">Login</dt><dd className="font-medium">{userDetailQuery.data.login}</dd></div><div><dt className="text-slate-500">Departamento</dt><dd className="font-medium">{departmentsQuery.isLoading ? "Carregando..." : departmentsQuery.isError ? <span className="text-rose-700 dark:text-rose-300" role="alert">Não foi possível carregar departamentos. <button className="font-semibold underline" onClick={() => void departmentsQuery.refetch()} type="button">Tentar novamente</button></span> : departmentName ?? "Sem departamento"}</dd></div><div><dt className="text-slate-500">Perfil</dt><dd className="font-medium">{getProfileLabel(userDetailQuery.data)}</dd></div></dl>
              </div>
            ) : null}
          </aside>
          </div>
        )}
      </div>

      <PaginationControls
        count={users.length}
        hasMore={usersQuery.data?.hasMore ?? false}
        isFetching={usersQuery.isFetching}
        limit={PAGE_SIZE}
        onFirst={() => setPage(1)}
        onLast={() => setPage(totalPages)}
        onNext={() => setPage((current) => current + 1)}
        onPageChange={setPage}
        onPrevious={() => setPage((current) => Math.max(1, current - 1))}
        page={page}
        total={total}
        totalPages={totalPages}
      />
      <CreateUserModal
        canCreateOrganizationOwner
        departments={departmentsQuery.data}
        departmentsError={departmentsQuery.isError}
        departmentsLoading={departmentsQuery.isLoading}
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreateUser={(payload) => createUserMutation.mutateAsync(payload)}
        onRetryDepartments={() => void departmentsQuery.refetch()}
        onUserCreated={(user: UserItem) => { setSelectedUserId(user.id); setIsCreateOpen(false); }}
        organizationId={organization.id}
      />
    </section>
  );
}
