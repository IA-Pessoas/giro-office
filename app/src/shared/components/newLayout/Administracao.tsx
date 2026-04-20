import { useEffect, useMemo, useState } from "react";
import { BarChart3, KeyRound, Lock, Plus, Search, Shield, Users } from "lucide-react";
import { toast } from "react-toastify";

import { departmentService, type DepItem } from "@modules/departments";
import { AdminUserDetailsPanel, CreateUserModal, type UserItem } from "@modules/users";
import {
  ADMIN_USER_STATUS_LABELS,
  type AdminUserStatus,
  getAdminUserStatusLabel,
  listAdminUsers,
} from "@modules/users/services/adminUsersService";
import { useAuth } from "@/context/AuthContext";
import { setupAPIClient } from "@shared/services/api";
import { useFetch } from "@shared/hooks";

const ADMIN_GRADIENT_ICON_CLASSNAME =
  "bg-gradient-to-br from-[var(--colors-brand-gradient-start)] to-[var(--colors-brand-gradient-end)] shadow-lg shadow-blue-950/20";

const ADMIN_GRADIENT_BUTTON_CLASSNAME =
  "bg-gradient-to-r from-[var(--colors-brand-gradient-start)] to-[var(--colors-brand-gradient-end)] shadow-lg shadow-blue-950/20 transition-all hover:from-[var(--colors-brand-gradient-hover-start)] hover:to-[var(--colors-brand-gradient-hover-end)]";

const ADMIN_ACTIVE_TAB_CLASSNAME =
  "bg-[var(--colors-brand-soft)] text-[var(--colors-brand-strong)] dark:bg-blue-900/30 dark:text-blue-300";

const ADMIN_PANEL_CLASSNAME =
  "rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900";

const ADMIN_SUBPANEL_CLASSNAME =
  "rounded-2xl border border-slate-200 bg-slate-50/70 dark:border-slate-700 dark:bg-slate-950/40";

const ADMIN_FEEDBACK_PANEL_CLASSNAME =
  "rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-950/40";

const ADMIN_LABEL_CLASSNAME = "dialog-neutral-label block text-sm font-medium text-slate-700 dark:text-white";

const ADMIN_TEXT_CLASSNAME = "dialog-neutral-text text-sm text-slate-700 dark:text-white";

const ADMIN_MUTED_CLASSNAME = "dialog-neutral-muted text-sm text-slate-500 dark:text-slate-300";

export function Administracao() {
  const [activeTab, setActiveTab] = useState<"dashboard" | "users" | "permissions">("dashboard");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [organizationId, setOrganizationId] = useState<string | undefined>(undefined);
  const [isLoadingOrganizationId, setIsLoadingOrganizationId] = useState(false);
  const [userStatusFilter, setUserStatusFilter] = useState<AdminUserStatus>("active");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const { user } = useAuth();

  const {
    data: users = [],
    refetch: refetchUsers,
    isLoading: isUsersLoading,
    error: usersError,
  } = useFetch(
    ["admin-users", userStatusFilter],
    () => listAdminUsers(userStatusFilter),
  );
  const {
    data: departments = [],
    error: departmentsError,
    isLoading: isDepartmentsLoading,
    refetch: refetchDepartments,
  } = useFetch<DepItem[]>(["admin-departments"], () => departmentService.list(), {
    enabled: activeTab === "users" || isCreateModalOpen,
  });

  const filteredUsers = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    if (!normalizedSearch) {
      return users;
    }

    return users.filter((candidate) => candidate.name.toLowerCase().includes(normalizedSearch));
  }, [searchTerm, users]);

  const dashboardCards = [
    {
      title: "Usuarios Ativos",
      value: users.length,
      icon: Users,
      iconClassName:
        "bg-[var(--colors-brand-soft)] text-[var(--colors-brand-strong)] dark:bg-blue-900/30 dark:text-blue-300",
    },
    {
      title: "Perfis de Acesso",
      value: 12,
      icon: KeyRound,
      iconClassName: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300",
    },
  ];

  useEffect(() => {
    if (!user?.id) {
      setOrganizationId(undefined);
      return;
    }

    let isMounted = true;

    async function loadOrganizationId() {
      setIsLoadingOrganizationId(true);
      try {
        const api = setupAPIClient();
        const response = await api.get("/user/me");
        const meData = response.data?.data ?? response.data?.user;
        const nextOrganizationId =
          typeof meData?.organization_id === "string" && meData.organization_id.trim().length > 0
            ? meData.organization_id
            : undefined;

        if (isMounted) {
          setOrganizationId(nextOrganizationId);
        }
      } catch (error) {
        if (isMounted) {
          setOrganizationId(undefined);
        }
        console.error("Erro ao carregar organization_id do usuario logado", error);
      } finally {
        if (isMounted) {
          setIsLoadingOrganizationId(false);
        }
      }
    }

    void loadOrganizationId();

    return () => {
      isMounted = false;
    };
  }, [user?.id]);

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

  const hasDepartmentFetchSettled = activeTab === "users" || isCreateModalOpen || Boolean(departmentsError) || departments.length > 0;
  const isCreateBlockedByDepartments =
    hasDepartmentFetchSettled && (Boolean(departmentsError) || (!isDepartmentsLoading && departments.length === 0));

  const handleOpenCreateModal = async () => {
    if (!isDepartmentsLoading && (departmentsError || departments.length === 0)) {
      void refetchDepartments();
    }

    setIsCreateModalOpen(true);
  };
  const handleCloseCreateModal = () => setIsCreateModalOpen(false);
  const handleUserCreated = (_user: UserItem) => {
    void refetchUsers();
  };

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
            Administracao
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Gestao de usuarios, permissoes e configuracoes do sistema
          </p>
        </div>
        <button
          className={`self-end lg:self-auto w-fit flex items-center gap-2 rounded-xl px-4 py-2.5 text-white ${ADMIN_GRADIENT_BUTTON_CLASSNAME}`}
          type="button"
          onClick={handleOpenCreateModal}
          aria-disabled={isCreateBlockedByDepartments}
        >
          <Plus className="h-5 w-5" />
          Novo Usuario
        </button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center gap-1 overflow-x-auto">
          {[
            { key: "dashboard", label: "Dashboard", icon: BarChart3 },
            { key: "users", label: "Usuarios", icon: Users },
            { key: "permissions", label: "Permissoes", icon: Lock },
          ].map((tab) => {
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
                className="h-full rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900"
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
        <div className="admin-users-shell grid gap-4 xl:h-[90vh] xl:grid-cols-[360px_minmax(0,1fr)] xl:items-stretch">
          <aside className={`${ADMIN_PANEL_CLASSNAME} overflow-hidden p-4 xl:h-full`}>
            <div className="flex h-full min-h-0 flex-col space-y-4">
              <div className="space-y-1">
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">Usuarios</h2>
                <p className={ADMIN_MUTED_CLASSNAME}>
                  Busque e selecione um usuario para continuar.
                </p>
              </div>

              {departmentsError ? (
                <div className={ADMIN_FEEDBACK_PANEL_CLASSNAME}>
                  <p className={ADMIN_TEXT_CLASSNAME}>
                    Departamentos indisponiveis. A criacao de usuarios foi bloqueada ate a integracao voltar.
                  </p>
                </div>
              ) : !isDepartmentsLoading && departments.length === 0 ? (
                <div className={ADMIN_FEEDBACK_PANEL_CLASSNAME}>
                  <p className={ADMIN_TEXT_CLASSNAME}>
                    Nenhum departamento foi retornado pelo backend. A criacao de usuarios esta indisponivel.
                  </p>
                </div>
              ) : null}

              {usersError ? (
                <div className={ADMIN_FEEDBACK_PANEL_CLASSNAME}>
                  <p className={ADMIN_TEXT_CLASSNAME}>
                    Nao foi possivel carregar a lista de usuarios.
                  </p>
                  <button
                    type="button"
                    onClick={() => void refetchUsers()}
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
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition-all focus:border-[var(--colors-brand-gradient-end)] focus:ring-2 focus:ring-[var(--colors-brand-gradient-start)]/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
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
                    {filteredUsers.length} usuario{filteredUsers.length === 1 ? "" : "s"}
                  </p>
                  <span className="rounded-full bg-[var(--colors-brand-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--colors-brand-strong)] dark:bg-blue-900/30 dark:text-blue-300">
                    {ADMIN_USER_STATUS_LABELS[userStatusFilter]}
                  </span>
                </div>

                <div className="min-h-0 space-y-3 overflow-y-auto pr-1">
                  {isUsersLoading ? (
                    <div className={`${ADMIN_FEEDBACK_PANEL_CLASSNAME} border-dashed p-6 text-center`}>
                      <p className={ADMIN_MUTED_CLASSNAME}>Carregando usuarios...</p>
                    </div>
                  ) : usersError ? (
                    <div className={`${ADMIN_FEEDBACK_PANEL_CLASSNAME} border-dashed p-6 text-center`}>
                      <p className={ADMIN_MUTED_CLASSNAME}>
                        A listagem nao esta disponivel no momento.
                      </p>
                    </div>
                  ) : filteredUsers.length === 0 ? (
                    <div className={`${ADMIN_FEEDBACK_PANEL_CLASSNAME} border-dashed p-6 text-center`}>
                      <p className={ADMIN_TEXT_CLASSNAME}>
                        Nenhum usuario encontrado.
                      </p>
                      <p className={`mt-1 ${ADMIN_MUTED_CLASSNAME}`}>
                        Ajuste a busca ou troque o filtro para ver outros resultados.
                      </p>
                    </div>
                  ) : (
                    filteredUsers.map((candidate) => {
                      const isSelected = candidate.id === selectedUserId;
                      const departmentName =
                        departments.find((department) => department.id === candidate.department_id)?.name ??
                        candidate.department?.name ??
                        "Sem departamento";

                      return (
                        <button
                          key={candidate.id}
                          type="button"
                          onClick={() => setSelectedUserId(candidate.id)}
                          className={`w-full rounded-2xl border p-4 text-left transition-all ${
                            isSelected
                              ? "border-[var(--colors-brand-gradient-end)] bg-slate-50 shadow-sm dark:bg-slate-950/60"
                              : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600 dark:hover:bg-slate-800/70"
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

          <section className={`${ADMIN_PANEL_CLASSNAME} overflow-hidden p-6 xl:h-full`}>
            <AdminUserDetailsPanel
              userId={selectedUserId}
              departments={departments}
              departmentsError={Boolean(departmentsError)}
              onUserUpdated={() => refetchUsers()}
            />
          </section>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white/80 p-8 text-center dark:border-slate-700 dark:bg-slate-900/70">
          <p className={ADMIN_TEXT_CLASSNAME}>
            Esta aba permanece somente visual neste refactor.
          </p>
          <p className={`mt-2 ${ADMIN_MUTED_CLASSNAME}`}>
            O fluxo real de criacao continua disponivel pelo botao "Novo Usuario".
          </p>
        </div>
      )}

      <CreateUserModal
        isOpen={isCreateModalOpen}
        onClose={handleCloseCreateModal}
        onUserCreated={handleUserCreated}
        departments={departments}
        departmentsLoading={isDepartmentsLoading}
        departmentsError={Boolean(departmentsError)}
        organizationId={organizationId}
        organizationIdLoading={isLoadingOrganizationId}
        invitedBy={user?.id}
      />
    </div>
  );
}
