import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  RefreshCw,
  Search,
  UserRound,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { usePlatformUsers } from "../hooks/usePlatformUsers";
import type { PlatformOrganization, PlatformOrganizationUser } from "../types";

const USERS_PAGE_SIZE = 20;

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function getUserLogin(user: PlatformOrganizationUser): string {
  return user.login;
}

function getUserProfileLabel(user: PlatformOrganizationUser): string {
  if (user.type === "owner") {
    return "Proprietário";
  }

  if (user.type === "admin") {
    return "Admin";
  }

  if (user.type === "user") {
    return "Usuário";
  }

  return `Permissão ${user.permission}`;
}

function getStatusLabel(status: string): string {
  if (!status) {
    return "Sem status";
  }

  if (status.toLowerCase() === "active") {
    return "Ativo";
  }

  if (status.toLowerCase() === "inactive") {
    return "Inativo";
  }

  return status;
}

function filterUsers(users: PlatformOrganizationUser[], searchTerm: string) {
  const normalizedSearch = normalizeSearchText(searchTerm);

  if (!normalizedSearch) {
    return users;
  }

  return users.filter((user) => {
    const searchableValues = [
      user.name,
      user.login,
      getUserProfileLabel(user),
      getStatusLabel(user.status),
    ];

    return searchableValues.some((value) => normalizeSearchText(value).includes(normalizedSearch));
  });
}

export function PlatformUsersPanel({ organization }: { organization: PlatformOrganization }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [userPage, setUserPage] = useState(1);
  const usersQuery = usePlatformUsers(organization.id, {
    skip: (userPage - 1) * USERS_PAGE_SIZE,
    take: USERS_PAGE_SIZE,
  });
  const users = usersQuery.data?.users ?? [];
  const filteredUsers = useMemo(() => filterUsers(users, searchTerm), [searchTerm, users]);
  const totalUsers = usersQuery.data?.total ?? users.length;
  const totalPages = Math.max(1, Math.ceil(totalUsers / USERS_PAGE_SIZE));
  const canGoToFirstPage = userPage > 1 && !usersQuery.isFetching;
  const canGoToPreviousPage = userPage > 1 && !usersQuery.isFetching;
  const canGoToNextPage = userPage < totalPages && !usersQuery.isFetching;
  const canGoToLastPage = userPage < totalPages && !usersQuery.isFetching;

  useEffect(() => {
    setSearchTerm("");
    setUserPage(1);
  }, [organization.id]);

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">
            Usuários da organização
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {filteredUsers.length} de {totalUsers} usuário{totalUsers === 1 ? "" : "s"}
          </p>
        </div>
        <button
          type="button"
          disabled
          className="inline-flex w-fit items-center gap-2 rounded-xl bg-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400"
        >
          <UserRound className="h-4 w-4" />
          Novo usuário
        </button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-950/40">
        <label className="block text-sm font-medium text-slate-700 dark:text-white">
          Busca
        </label>
        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Nome, login ou perfil"
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-900 shadow-sm outline-none transition-all placeholder:text-slate-400 focus:border-[var(--colors-brand-gradient-end)] focus:ring-2 focus:ring-[var(--colors-brand-gradient-start)]/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500"
          />
        </div>
      </div>

      {usersQuery.isLoading ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-8 text-center dark:border-slate-700 dark:bg-slate-950/40">
          <p className="text-sm text-slate-600 dark:text-slate-300">Carregando usuários...</p>
        </div>
      ) : usersQuery.isError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/90 p-4 text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-100">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-medium">Não foi possível carregar usuários.</p>
            <button
              type="button"
              onClick={() => void usersQuery.refetch()}
              className="inline-flex w-fit items-center gap-2 rounded-xl border border-rose-200 px-3 py-2 text-sm font-medium transition-colors hover:bg-rose-100 dark:border-rose-900/60 dark:hover:bg-rose-900/30"
            >
              <RefreshCw className="h-4 w-4" />
              Tentar novamente
            </button>
          </div>
        </div>
      ) : users.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-8 text-center dark:border-slate-700 dark:bg-slate-950/40">
          <p className="text-sm font-medium text-slate-900 dark:text-white">
            Nenhum usuário retornado para esta organização.
          </p>
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-8 text-center dark:border-slate-700 dark:bg-slate-950/40">
          <p className="text-sm font-medium text-slate-900 dark:text-white">
            Nenhum usuário corresponde à busca.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700">
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {filteredUsers.map((user) => (
              <div
                key={user.id}
                className="grid gap-3 bg-white p-4 transition-colors hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800/70 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_120px]"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                    {user.name}
                  </p>
                  <p className="truncate text-sm text-slate-600 dark:text-slate-300">
                    {getUserLogin(user) || "Sem login"}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Perfil
                  </p>
                  <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
                    {getUserProfileLabel(user)}
                  </p>
                </div>
                <div className="flex items-start lg:justify-end">
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    {getStatusLabel(user.status)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-slate-200 pt-3 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setUserPage(1)}
            disabled={!canGoToFirstPage}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-45 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            aria-label="Primeira página de usuários"
          >
            <ChevronsLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setUserPage((currentPage) => Math.max(1, currentPage - 1))}
            disabled={!canGoToPreviousPage}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-45 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            aria-label="Página anterior de usuários"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        </div>
        <p className="shrink-0 text-sm font-medium text-slate-600 dark:text-slate-300">
          Página {userPage} de {totalPages}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setUserPage((currentPage) => currentPage + 1)}
            disabled={!canGoToNextPage}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-45 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            aria-label="Próxima página de usuários"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setUserPage(totalPages)}
            disabled={!canGoToLastPage}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-45 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            aria-label="Última página de usuários"
          >
            <ChevronsRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </section>
  );
}
