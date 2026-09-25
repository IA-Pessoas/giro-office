import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { BarChart3, KeyRound, Lock, Plus, Search, Shield, Users } from "lucide-react";
import { useRouter } from "next/router";
import { toast } from "@shared/services/toast";

import { departmentService, type DepItem } from "@modules/departments";
import {
  AdminPermissionsEditor,
  AdminUserDetailsPanel,
  CreateUserModal,
  userService,
  type UserItem,
} from "@modules/users";
import {
  canAccessAdministration,
  canCreateOrganizationOwner,
  useModuleAccess,
} from "@modules/auth";
import { PERMISSION_MODULE_GROUPS } from "@modules/users/constants/permissionConfig";
import { permissionService } from "@modules/users/services/permissionService";
import {
  ADMIN_USER_STATUS_LABELS,
  type AdminUserStatus,
  getAdminUserStatusLabel,
  listAdminUsers,
} from "@modules/users/services/adminUsersService";
import { signOut, useAuth } from "@/context/AuthContext";
import { useFetch } from "@shared/hooks";
import { formatCount } from "@shared/utils/formatters";

const ADMIN_GRADIENT_ICON_CLASSNAME =
  "bg-gradient-to-br from-[var(--colors-brand-gradient-start)] to-[var(--colors-brand-gradient-end)] shadow-lg shadow-blue-950/20";

const ADMIN_GRADIENT_BUTTON_CLASSNAME =
  "bg-gradient-to-r from-[var(--colors-brand-gradient-start)] to-[var(--colors-brand-gradient-end)] shadow-lg shadow-blue-950/20 transition-all hover:from-[var(--colors-brand-gradient-hover-start)] hover:to-[var(--colors-brand-gradient-hover-end)] disabled:cursor-not-allowed disabled:opacity-70";

const ADMIN_ACTIVE_TAB_CLASSNAME =
  "bg-[var(--colors-brand-soft)] text-[var(--colors-brand-strong)] dark:bg-blue-900/30 dark:text-blue-300";

const ADMIN_PANEL_CLASSNAME =
  "rounded-3xl bg-white shadow-sm dark:bg-slate-900";

const ADMIN_SUBPANEL_CLASSNAME =
  "rounded-2xl bg-slate-50/70 dark:bg-slate-950/40";

const ADMIN_FEEDBACK_PANEL_CLASSNAME =
  "rounded-2xl bg-slate-50/70 p-4 dark:bg-slate-950/40";

const ADMIN_EMPTY_STATE_CLASSNAME =
  "rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-6 text-center dark:border-slate-700 dark:bg-slate-950/30";

const ADMIN_LABEL_CLASSNAME = "dialog-neutral-label block text-sm font-medium text-slate-700 dark:text-white";

const ADMIN_TEXT_CLASSNAME = "dialog-neutral-text text-sm text-slate-700 dark:text-white";

const ADMIN_MUTED_CLASSNAME = "dialog-neutral-muted text-sm text-slate-500 dark:text-slate-300";

const ADMIN_SELECT_CLASSNAME =
  "w-full appearance-none rounded-lg border border-slate-200 bg-white bg-[length:14px] bg-[position:right_0.95rem_center] bg-no-repeat px-3 py-2.5 pr-11 text-sm text-slate-900 shadow-sm outline-none transition-all focus:border-[var(--colors-brand-gradient-end)] focus:ring-2 focus:ring-[var(--colors-brand-gradient-start)]/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white";

const ADMIN_SELECT_ARROW_STYLE = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none'%3E%3Cpath d='m5 7.5 5 5 5-5' stroke='%2394a3b8' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
} as const;


const adminUsersRootQueryKey = ["admin-users"] as const;
const adminUsersSummaryRootQueryKey = ["admin-users-summary"] as const;
const adminUsersQueryKey = (status: AdminUserStatus) => [...adminUsersRootQueryKey, status] as const;

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export function Administracao() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"dashboard" | "users" | "permissions">("dashboard");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [userStatusFilter, setUserStatusFilter] = useState<AdminUserStatus>("active");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const { user } = useAuth();
  // A sessão já traz a organização; buscar /user/me de novo a cada visita duplicava a chamada (#1369).
  const organizationId = user?.organization_id?.trim() || undefined;
  const { access: rhAccess, isLoading: isRhAccessLoading } = useModuleAccess("rh");
  const canManageOrganizationOwners = canCreateOrganizationOwner(user);
  const hasAdminAccess = canAccessAdministration(user, { rhAccess });
  const canManagePermissions = canManageOrganizationOwners;
  const isAdministrationAccessLoading =
    !canManageOrganizationOwners && isRhAccessLoading;
  const queryClient = useQueryClient();
  const invalidateAdminUserLists = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: adminUsersRootQueryKey }),
      queryClient.invalidateQueries({ queryKey: adminUsersSummaryRootQueryKey }),
    ]);

  const {
    data: users = [],
    isLoading: isUsersLoading,
    error: usersError,
  } = useFetch(
    adminUsersQueryKey(userStatusFilter),
    () => listAdminUsers(userStatusFilter),
    {
      enabled: hasAdminAccess,
      retry: false,
    },
  );
  const {
    data: activeUsers = [],
  } = useFetch(
    ["admin-users-summary", "active"],
    () => listAdminUsers("active"),
    {
      enabled: hasAdminAccess && activeTab === "dashboard",
      retry: false,
    },
  );
  // Mesma chave do useModuleAccess: é a mesma lista, e com chaves diferentes ela era pedida
  // duas vezes na mesma navegação (#1369).
  const {
    data: departments = [],
    error: departmentsError,
    isLoading: isDepartmentsLoading,
    refetch: refetchDepartments,
  } = useFetch<DepItem[]>(["module-access", "departments"], () => departmentService.list(), {
    enabled:
      hasAdminAccess &&
      (activeTab === "users" ||
        (canManagePermissions && activeTab === "permissions") ||
        isCreateModalOpen),
    retry: false,
  });

  const filteredUsers = useMemo(() => {
    const normalizedSearch = normalizeSearchText(searchTerm);

    if (!normalizedSearch) {
      return users;
    }

    return users.filter((candidate) => {
      const normalizedName = normalizeSearchText(candidate.name);

      if (normalizedName.startsWith(normalizedSearch)) {
        return true;
      }

      return normalizedName.split(/\s+/).some((part) => part.startsWith(normalizedSearch));
    });
  }, [searchTerm, users]);

  const departmentNameById = useMemo(() => {
    return new Map(departments.map((department) => [department.id, department.name]));
  }, [departments]);

  const managedModulesCount = useMemo(
    () => PERMISSION_MODULE_GROUPS.reduce((total, group) => total + group.keys.length, 0),
    [],
  );

  const dashboardCards = [
    {
      title: "Usuários ativos",
      value: activeUsers.length,
      icon: Users,
      iconClassName:
        "bg-[var(--colors-brand-soft)] text-[var(--colors-brand-strong)] dark:bg-blue-900/30 dark:text-blue-300",
    },
    {
      title: "Módulos gerenciados",
      value: managedModulesCount,
      icon: KeyRound,
      iconClassName: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300",
    },
  ];

  useEffect(() => {
    if (!user) {
      return;
    }

    if (isAdministrationAccessLoading) {
      return;
    }

    if (!hasAdminAccess) {
      void router.replace("/dashboard");
    }
  }, [hasAdminAccess, isAdministrationAccessLoading, router, user]);

  useEffect(() => {
    if (activeTab === "permissions" && !canManagePermissions) {
      setActiveTab("users");
    }
  }, [activeTab, canManagePermissions]);

  useEffect(() => {
    if (users.length === 0) {
      setSelectedUserId(null);
      return;
    }

    setSelectedUserId((currentSelectedUserId) => {
      if (currentSelectedUserId && users.some((candidate) => candidate.id === currentSelectedUserId)) {
        return currentSelectedUserId;
      }

      return users[0]?.id ?? null;
    });
  }, [users]);

  useEffect(() => {
    if (hasAdminAccess && isAxiosError(usersError) && usersError.response?.status === 403) {
      void router.replace("/dashboard");
    }
  }, [hasAdminAccess, router, usersError]);

  const hasDepartmentFetchSettled = activeTab === "users" || isCreateModalOpen || Boolean(departmentsError) || departments.length > 0;
  const isCreateBlockedByDepartments =
    hasDepartmentFetchSettled && (Boolean(departmentsError) || (!isDepartmentsLoading && departments.length === 0));

  const handleOpenCreateModal = () => {
    if (!isDepartmentsLoading && (departmentsError || departments.length === 0)) {
      void refetchDepartments();
    }
    setIsCreateModalOpen(true);
  };
  const handleCloseCreateModal = () => setIsCreateModalOpen(false);
  const handleUserCreated = (_user: UserItem) => {
    void invalidateAdminUserLists();
  };
  const handleRetryDepartments = () => {
    void refetchDepartments();
  };

  const getDepartmentName = (candidate: UserItem): string => {
    return (
      departmentNameById.get(candidate.department_id) ??
      candidate.department?.name ??
      "Sem departamento"
    );
  };
  const administrationUserContracts = {
    createUser: userService.create,
    details: {
      loadUser: userService.getById,
      saveUser: userService.update,
      sendPasswordReset: userService.sendPasswordReset,
    },
    permissions: {
      listUsers: () => listAdminUsers("active"),
      loadPermissions: (userId: string, signal?: AbortSignal) =>
        permissionService.getByUserId(userId, undefined, { signal }),
      savePermissions: permissionService.update,
      syncDepartmentPermission: async (userId: string, payload: Parameters<typeof userService.update>[1]) => {
        await userService.update(userId, payload);
      },
    },
  };

  if (isAdministrationAccessLoading) {
    return (
      <div className={ADMIN_FEEDBACK_PANEL_CLASSNAME}>
        <p className={ADMIN_TEXT_CLASSNAME}>Carregando acesso de administração.</p>
      </div>
    );
  }

  if (!hasAdminAccess) {
    return null;
  }

  const adminTabs = [
    { key: "dashboard", label: "Dashboard", icon: BarChart3 },
    { key: "users", label: "Usuários", icon: Users },
    ...(canManagePermissions
      ? [{ key: "permissions", label: "Permissões", icon: Lock }]
      : []),
  ] as const;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="mb-1 flex items-center gap-3 text-3xl font-bold text-gray-900 dark:text-white">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-xl ${ADMIN_GRADIENT_ICON_CLASSNAME}`}
            >
              <Shield className="h-6 w-6 text-white" />
            </div>
            Administração
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Gestão de usuários, permissões e configurações do sistema
          </p>
        </div>
        <button
          className={`inline-flex w-fit items-center gap-2 self-end rounded-xl px-4 py-2.5 text-sm font-semibold text-white lg:self-auto ${ADMIN_GRADIENT_BUTTON_CLASSNAME}`}
          type="button"
          onClick={handleOpenCreateModal}
          disabled={isCreateBlockedByDepartments}
        >
          <Plus className="h-5 w-5" />
          Novo usuário
        </button>
      </div>

      <div className="rounded-2xl bg-white p-1 shadow-sm dark:bg-slate-900">
        <div className="flex items-center gap-1 overflow-x-auto u-scrollbar-system">
          {adminTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;

            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key as typeof activeTab)}
                className={`min-w-fit flex-1 rounded-xl px-4 py-2.5 text-sm font-medium transition-all ${
                  isActive
                    ? ADMIN_ACTIVE_TAB_CLASSNAME
                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                }`}
              >
                <Icon className="mr-2 inline-block h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {activeTab === "dashboard" ? (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-4">
          {dashboardCards.map((card) => {
            const Icon = card.icon;

            return (
              <div
                key={card.title}
                className="h-full rounded-2xl bg-white p-5 shadow-sm dark:bg-slate-900"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="mb-1 text-sm text-slate-600 dark:text-slate-400">{card.title}</p>
                    <p className="text-2xl font-semibold text-slate-900 dark:text-white">{card.value}</p>
                  </div>
                  <div
                    className={`flex h-11 w-11 items-center justify-center rounded-xl ${card.iconClassName}`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : activeTab === "users" ? (
        <div className="admin-users-shell grid gap-4 xl:h-[742px] xl:grid-cols-[350px_minmax(0,1fr)] xl:items-stretch">
          <aside className={`${ADMIN_PANEL_CLASSNAME} overflow-hidden p-4 max-xl:h-[680px] xl:h-full`}>
            <div className="flex h-full min-h-0 flex-col space-y-4">
              <div className="space-y-1">
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">Usuários</h2>
                <p className={ADMIN_MUTED_CLASSNAME}>
                  Busque e selecione um usuário para continuar.
                </p>
              </div>

              {departmentsError ? (
                <div className={ADMIN_FEEDBACK_PANEL_CLASSNAME}>
                  <p className={ADMIN_TEXT_CLASSNAME}>
                    Departamentos indisponíveis. A criação de usuários foi bloqueada até a integração voltar.
                  </p>
                  <button
                    type="button"
                    onClick={handleRetryDepartments}
                    className="mt-3 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    Tentar novamente
                  </button>
                </div>
              ) : !isDepartmentsLoading && departments.length === 0 ? (
                <div className={ADMIN_FEEDBACK_PANEL_CLASSNAME}>
                  <p className={ADMIN_TEXT_CLASSNAME}>
                    Ainda não há departamentos cadastrados. Cadastre um departamento para criar usuários.
                  </p>
                  <button
                    type="button"
                    onClick={handleRetryDepartments}
                    className="mt-3 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    Atualizar lista
                  </button>
                </div>
              ) : null}

              {usersError ? (
                <div className={ADMIN_FEEDBACK_PANEL_CLASSNAME}>
                  <p className={ADMIN_TEXT_CLASSNAME}>
                    Não foi possível carregar a lista de usuários.
                  </p>
                  <button
                    type="button"
                    onClick={() => void invalidateAdminUserLists()}
                    className="mt-3 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    Tentar novamente
                  </button>
                </div>
              ) : null}

              <div className={`${ADMIN_SUBPANEL_CLASSNAME} space-y-3 p-3`}>
                <label className={ADMIN_LABEL_CLASSNAME}>Busca</label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Buscar por nome"
                    className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-900 shadow-sm outline-none transition-all placeholder:text-slate-400 focus:border-[var(--colors-brand-gradient-end)] focus:ring-2 focus:ring-[var(--colors-brand-gradient-start)]/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500"
                  />
                </div>

                <label className={ADMIN_LABEL_CLASSNAME}>Status</label>
                <select
                  value={userStatusFilter}
                  onChange={(event) => setUserStatusFilter(event.target.value as AdminUserStatus)}
                  className={ADMIN_SELECT_CLASSNAME}
                  style={ADMIN_SELECT_ARROW_STYLE}
                >
                  {Object.entries(ADMIN_USER_STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex min-h-0 flex-1 flex-col space-y-3">
                <div className="flex items-center justify-between">
                  <p className={ADMIN_TEXT_CLASSNAME}>
                    {formatCount(filteredUsers.length, "usuário", "usuários")}
                  </p>
                  <span className="rounded-full bg-[var(--colors-brand-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--colors-brand-strong)] dark:bg-blue-900/30 dark:text-blue-300">
                    {ADMIN_USER_STATUS_LABELS[userStatusFilter]}
                  </span>
                </div>

                <div className="min-h-0 space-y-3 overflow-y-auto pr-1">
                  {isUsersLoading ? (
                    <div className={ADMIN_EMPTY_STATE_CLASSNAME}>
                      <p className={ADMIN_MUTED_CLASSNAME}>Carregando usuários...</p>
                    </div>
                  ) : usersError ? (
                    <div className={ADMIN_EMPTY_STATE_CLASSNAME}>
                      <p className={ADMIN_MUTED_CLASSNAME}>
                        A listagem não está disponível no momento.
                      </p>
                    </div>
                  ) : filteredUsers.length === 0 ? (
                    <div className={ADMIN_EMPTY_STATE_CLASSNAME}>
                      <p className={ADMIN_TEXT_CLASSNAME}>
                        Nenhum usuário encontrado.
                      </p>
                      <p className={`mt-1 ${ADMIN_MUTED_CLASSNAME}`}>
                        Ajuste a busca ou troque o filtro para ver outros resultados.
                      </p>
                    </div>
                  ) : (
                    filteredUsers.map((candidate) => {
                      const isSelected = candidate.id === selectedUserId;
                      const departmentName = getDepartmentName(candidate);

                      return (
                        <button
                          key={candidate.id}
                          type="button"
                          onClick={() => setSelectedUserId(candidate.id)}
                          className={`w-full rounded-2xl p-4 text-left transition-all ${
                            isSelected
                              ? "bg-slate-50 shadow-sm ring-1 ring-[var(--colors-brand-gradient-end)] dark:bg-slate-950/60"
                              : "bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800/70"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                                {candidate.name}
                              </p>
                              <p className="dialog-neutral-muted truncate text-sm text-slate-600 dark:text-slate-300">
                                {departmentName}
                              </p>
                            </div>
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                              {getAdminUserStatusLabel(candidate.status)}
                            </span>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </aside>

          <section className={`${ADMIN_PANEL_CLASSNAME} overflow-hidden p-6 max-xl:h-[680px] xl:h-full`}>
            <AdminUserDetailsPanel
              userId={selectedUserId}
              departments={departments}
              departmentsError={Boolean(departmentsError)}
              onUserUpdated={() => invalidateAdminUserLists()}
              canManageUsers={hasAdminAccess}
              dataSource={administrationUserContracts.details}
            />
          </section>
        </div>
      ) : (
        <AdminPermissionsEditor
          dataSource={administrationUserContracts.permissions}
          departments={departments}
          currentUserId={user?.id}
          onAccessDenied={() => void router.replace("/dashboard")}
          onPermissionsUpdated={async () => {
            try {
              await invalidateAdminUserLists();
            } catch {
              toast.warn("Permissões salvas, mas a lista de acessos não pôde ser atualizada agora.");
            }
          }}
          onCurrentUserPermissionsUpdated={() =>
            signOut("Permissões atualizadas. Entre novamente para aplicar os novos acessos.")
          }
        />
      )}

      <CreateUserModal
        isOpen={isCreateModalOpen}
        onClose={handleCloseCreateModal}
        onUserCreated={handleUserCreated}
        onCreateUser={administrationUserContracts.createUser}
        departments={departments}
        departmentsLoading={isDepartmentsLoading}
        departmentsError={Boolean(departmentsError)}
        onRetryDepartments={handleRetryDepartments}
        organizationId={organizationId}
        invitedBy={user?.id}
        canCreateOrganizationOwner={canManageOrganizationOwners}
      />

    </div>
  );
}
