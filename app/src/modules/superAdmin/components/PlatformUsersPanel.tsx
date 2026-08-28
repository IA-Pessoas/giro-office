import { isAxiosError } from "axios";
import { Search, UserRound } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

import { ConfirmationDialog } from "@shared/components";
import { Dialog } from "@shared/components/ui/Dialog";
import { PaginationControls } from "@shared/components/ui/PaginationControls";
import { useDebouncedValue } from "@shared/hooks/useDebouncedValue";
import { Input } from "@shared/ui/newLayout/input";
import { CreateUserModal } from "@modules/users/components/CreateUserModal";
import { AdminPermissionsEditor } from "@modules/users/components/AdminPermissionsEditor";
import type { AdminUserPermissionsDataSource } from "@modules/users/types/adminUserContracts";
import type { PermissionDraft, UserItem } from "@modules/users/types";

import {
  usePlatformDepartments,
  usePlatformOwnershipTransferMutation,
  usePlatformUserDetail,
  usePlatformUserLifecycleMutation,
  usePlatformUserUpdateMutation,
  usePlatformUsers,
} from "../hooks/usePlatformUsers";
import { platformService } from "../services/platformService";
import type { PlatformOrganization, PlatformOrganizationUser } from "../types";
import { OwnershipTransferDialog } from "./OwnershipTransferDialog";

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
  const [isPermissionsOpen, setIsPermissionsOpen] = useState(false);
  const [isOwnershipTransferOpen, setIsOwnershipTransferOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<"deactivate" | "reactivate" | null>(null);
  const lifecycleActionRef = useRef<HTMLButtonElement>(null);
  const permissionActionRef = useRef<HTMLButtonElement>(null);
  const queryClient = useQueryClient();
  const debouncedSearch = useDebouncedValue(search.trim(), 300);
  const usersQuery = usePlatformUsers(organization.id, {
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
  });
  const users = usersQuery.data?.users ?? [];
  const ownershipCandidatesQuery = usePlatformUsers(organization.id, { skip: 0, take: 100 });
  const total = usersQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const userDetailQuery = usePlatformUserDetail(organization.id, selectedUserId);
  const departmentsQuery = usePlatformDepartments(organization.id);
  const userLifecycleMutation = usePlatformUserLifecycleMutation();
  const ownershipTransferMutation = usePlatformOwnershipTransferMutation();
  const userUpdateMutation = usePlatformUserUpdateMutation();
  const [editMode, setEditMode] = useState(false);
  const [passwordConfirmationOpen, setPasswordConfirmationOpen] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: "", login: "", department_id: "", password: "" });
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
    setIsOwnershipTransferOpen(false);
  }, [organization.id]);
  const selectedUser = userDetailQuery.data;
  const permissionsDataSource = useMemo<AdminUserPermissionsDataSource>(
    () => ({
      listUsers: async () => {
        const result = await platformService.listUsers(organization.id, { skip: 0, take: 100 });
        return result.users.map((user) => ({ ...user, permission: 0 }));
      },
      loadPermissions: (userId, signal) =>
        platformService.getUserPermissions(organization.id, userId, signal),
      savePermissions: (userId, permissions) =>
        platformService.updateUserPermissions(organization.id, userId, permissions),
      syncDepartmentPermission: async (userId, payload) => {
        await platformService.updateUserPermissions(
          organization.id,
          userId,
          (payload.modules ?? {}) as PermissionDraft,
        );
      },
    }),
    [organization.id],
  );

  useEffect(() => {
    if (!selectedUserId && users[0]) setSelectedUserId(users[0].id);
    if (selectedUserId && !users.some((user) => user.id === selectedUserId)) setSelectedUserId(null);
  }, [selectedUserId, users]);

  useEffect(() => {
    if (!selectedUser) return;
    setDraft({
      name: selectedUser.name,
      login: selectedUser.login,
      department_id: selectedUser.department_id,
      password: "",
    });
    setEditMode(false);
    setEditError(null);
  }, [selectedUser]);

  const saveUser = async () => {
    if (!selectedUser) return;
    setEditError(null);
    try {
      await userUpdateMutation.mutateAsync({
        organizationId: organization.id,
        userId: selectedUser.id,
        data: {
          name: draft.name,
          login: draft.login,
          department_id: draft.department_id,
          ...(draft.password.trim() ? { password: draft.password } : {}),
          expected_version: selectedUser.version,
        },
      });
      setEditMode(false);
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 409) {
        setEditError(
          "Este usuário foi alterado por outra pessoa. Recarregue o estado atual antes de salvar.",
        );
        return;
      }
      setEditError("Não foi possível salvar as alterações do usuário.");
    }
  };

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
                      {user.status === "active"
                        ? "Ativo"
                        : user.status === "inactive"
                          ? "Inativo"
                          : user.status || "Sem status"}
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
            ) : selectedUser ? (
              <div className="space-y-4">
                <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Usuário selecionado</p><h3 className="mt-1 text-lg font-semibold text-slate-950 dark:text-white">{selectedUser.name}</h3></div>
                {editError ? (
                  <div
                    className={
                      "rounded-lg bg-rose-50 p-3 text-sm text-rose-900 " +
                      "dark:bg-rose-950/30 dark:text-rose-100"
                    }
                    role="alert"
                  >
                    {editError}{" "}
                    <button
                      className="font-semibold underline"
                      onClick={() => void userDetailQuery.refetch()}
                      type="button"
                    >
                      Recarregar
                    </button>
                  </div>
                ) : null}
                {editMode ? (
                  <div className="space-y-3">
                    <label className="block text-sm font-medium">
                      Nome
                      <Input
                        value={draft.name}
                        onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                      />
                    </label>
                    <label className="block text-sm font-medium">
                      Login
                      <Input
                        value={draft.login}
                        onChange={(event) => setDraft({ ...draft, login: event.target.value })}
                      />
                    </label>
                    <label className="block text-sm font-medium">
                      Departamento
                      <select
                        className={
                          "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 " +
                          "dark:border-slate-700 dark:bg-slate-950"
                        }
                        value={draft.department_id}
                        onChange={(event) =>
                          setDraft({ ...draft, department_id: event.target.value })
                        }
                      >
                        {departmentsQuery.data?.map((department) => (
                          <option key={department.id} value={department.id}>
                            {department.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-sm font-medium">
                      Nova senha
                      <Input
                        autoComplete="new-password"
                        type="password"
                        value={draft.password}
                        onChange={(event) =>
                          setDraft({ ...draft, password: event.target.value })
                        }
                      />
                    </label>
                    <div className="flex gap-2">
                      <button
                        className={
                          "rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white " +
                          "disabled:opacity-60"
                        }
                        disabled={userUpdateMutation.isPending}
                        onClick={() =>
                          draft.password.trim()
                            ? setPasswordConfirmationOpen(true)
                            : void saveUser()
                        }
                        type="button"
                      >
                        Salvar alterações
                      </button>
                      <button
                        className="rounded-lg border px-3 py-2 text-sm font-semibold"
                        disabled={userUpdateMutation.isPending}
                        onClick={() => setEditMode(false)}
                        type="button"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <dl className="space-y-3 text-sm">
                      <div>
                        <dt className="text-slate-500">Login</dt>
                        <dd className="font-medium">{selectedUser.login}</dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">Departamento</dt>
                        <dd className="font-medium">
                          {departmentsQuery.isLoading
                            ? "Carregando..."
                            : departmentsQuery.isError
                              ? "Não foi possível carregar departamentos."
                              : departmentName ?? "Sem departamento"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">Perfil</dt>
                        <dd className="font-medium">{getProfileLabel(selectedUser)}</dd>
                      </div>
                    </dl>
                    <button
                      className="rounded-lg border px-3 py-2 text-sm font-semibold"
                      onClick={() => setEditMode(true)}
                      type="button"
                    >
                      Editar dados
                    </button>
                  </>
                )}
                <button
                  ref={permissionActionRef}
                  className="rounded-lg border border-blue-700 px-3 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:text-blue-200 dark:hover:bg-blue-950/30"
                  onClick={() => setIsPermissionsOpen(true)}
                  type="button"
                >
                  Editar permissões
                </button>
                {selectedUser.status === "active" && selectedUser.type === "owner" ? (
                  <button
                    className="rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
                    onClick={() => setIsOwnershipTransferOpen(true)}
                    type="button"
                  >
                    Transferir ownership
                  </button>
                ) : (
                <button
                  ref={lifecycleActionRef}
                  className={selectedUser.status === "active" ? "rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600" : "rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"}
                  onClick={() => setPendingAction(selectedUser.status === "active" ? "deactivate" : "reactivate")}
                  type="button"
                >
                  {selectedUser.status === "active" ? "Desativar usuário" : "Reativar usuário"}
                </button>
                )}
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

      <Dialog
        contentClassName="!w-[min(96vw,1120px)] !max-w-none"
        description="Use o mesmo editor modular da Administração. As alterações se aplicam somente ao tenant selecionado."
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          permissionActionRef.current?.focus();
        }}
        onOpenChange={setIsPermissionsOpen}
        open={isPermissionsOpen}
        title="Permissões modulares"
      >
        {isPermissionsOpen && selectedUserId ? (
          <AdminPermissionsEditor
            dataSource={permissionsDataSource}
            departments={departmentsQuery.data ?? []}
            initialUserId={selectedUserId}
            onPermissionsUpdated={() => undefined}
            queryKey={["platform", "organizations", organization.id, "permissions"]}
            syncDepartmentPermission={false}
          />
        ) : null}
      </Dialog>

      <ConfirmationDialog
        cancelLabel="Cancelar"
        confirmLabel={pendingAction === "deactivate" ? "Desativar usuário" : "Reativar usuário"}
        description={
          pendingAction === "deactivate"
            ? `Você vai desativar ${selectedUser?.name ?? "este usuário"} na organização ${organization.name}. As sessões atuais serão revogadas.`
            : `Você vai reativar ${selectedUser?.name ?? "este usuário"} na organização ${organization.name}. Somente novos logins serão permitidos.`
        }
        errorMessage={null}
        isConfirming={userLifecycleMutation.isPending}
        onConfirm={async () => {
          if (!pendingAction || !selectedUser) return;
          await userLifecycleMutation.mutateAsync({
            organizationId: organization.id,
            userId: selectedUser.id,
            action: pendingAction,
          });
        }}
        onOpenChange={(open) => {
          if (!open) setPendingAction(null);
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          lifecycleActionRef.current?.focus();
        }}
        open={pendingAction !== null}
        title={pendingAction === "deactivate" ? "Desativar usuário" : "Reativar usuário"}
        variant={pendingAction === "deactivate" ? "destructive" : "neutral"}
      />
      <ConfirmationDialog
        cancelLabel="Cancelar"
        confirmLabel="Alterar senha"
        description="A nova senha revogará todas as sessões atuais deste usuário."
        errorMessage={null}
        isConfirming={userUpdateMutation.isPending}
        onConfirm={async () => {
          setPasswordConfirmationOpen(false);
          await saveUser();
        }}
        onOpenChange={setPasswordConfirmationOpen}
        open={passwordConfirmationOpen}
        title="Confirmar alteração de senha"
        variant="destructive"
      />
      <OwnershipTransferDialog
        currentOwner={selectedUser?.type === "owner" && selectedUser.status === "active" ? selectedUser : null}
        isConfirming={ownershipTransferMutation.isPending}
        onOpenChange={setIsOwnershipTransferOpen}
        onTransfer={async ({ successorUserId, previousOwnerAction, justification }) => {
          if (!selectedUser) return;
          await ownershipTransferMutation.mutateAsync({
            organizationId: organization.id,
            currentOwnerId: selectedUser.id,
            successorUserId,
            previousOwnerAction,
            justification,
          });
        }}
        open={isOwnershipTransferOpen}
        organization={organization}
        users={ownershipCandidatesQuery.data?.users ?? []}
      />
    </section>
  );
}
