import { useEffect, useState } from "react";
import { BarChart3, KeyRound, Lock, Plus, Shield, Users } from "lucide-react";

import { CreateUserModal, userService, type UserItem } from "@modules/users";
import { TEMPORARY_DEPARTMENTS } from "@modules/users/constants/createUserConfig";
import { useAuth } from "@/context/AuthContext";
import { setupAPIClient } from "@shared/services/api";
import { useFetch } from "@shared/hooks";

const ADMIN_GRADIENT_ICON_CLASSNAME =
  "bg-gradient-to-br from-[var(--colors-brand-gradient-start)] to-[var(--colors-brand-gradient-end)] shadow-lg shadow-blue-950/20";

const ADMIN_GRADIENT_BUTTON_CLASSNAME =
  "bg-gradient-to-r from-[var(--colors-brand-gradient-start)] to-[var(--colors-brand-gradient-end)] shadow-lg shadow-blue-950/20 transition-all hover:from-[var(--colors-brand-gradient-hover-start)] hover:to-[var(--colors-brand-gradient-hover-end)]";

const ADMIN_ACTIVE_TAB_CLASSNAME =
  "bg-[var(--colors-brand-soft)] text-[var(--colors-brand-strong)] dark:bg-blue-900/30 dark:text-blue-300";

export function Administracao() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'users' | 'permissions'>('dashboard');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [organizationId, setOrganizationId] = useState<string | undefined>(undefined);
  const [isLoadingOrganizationId, setIsLoadingOrganizationId] = useState(false);
  const { user } = useAuth();

  const { data: users = [], refetch: refetchUsers } = useFetch(["users"], () => userService.list());
  const dashboardCards = [
    {
      title: "Usuários Ativos",
      value: users.length,
      icon: Users,
      iconClassName:
        "bg-[var(--colors-brand-soft)] text-[var(--colors-brand-strong)] dark:bg-blue-900/30 dark:text-blue-300",
    },
    {
      title: "Perfis de Acesso",
      value: 12,
      icon: KeyRound,
      iconClassName:
        "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300",
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

  const handleOpenCreateModal = () => setIsCreateModalOpen(true);
  const handleCloseCreateModal = () => setIsCreateModalOpen(false);
  const handleUserCreated = (_user: UserItem) => {
    void refetchUsers();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="mb-1 flex items-center gap-3 text-3xl font-bold text-gray-900 dark:text-white">
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${ADMIN_GRADIENT_ICON_CLASSNAME}`}>
              <Shield className="h-6 w-6 text-white" />
            </div>
            Administração
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Gestão de usuários, permissões e configurações do sistema
          </p>
        </div>
        <button
          className={`self-end lg:self-auto w-fit flex items-center gap-2 rounded-xl px-4 py-2.5 text-white ${ADMIN_GRADIENT_BUTTON_CLASSNAME}`}
          type="button"
          onClick={handleOpenCreateModal}
        >
          <Plus className="w-5 h-5" />
          Novo Usuário
        </button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center gap-1 overflow-x-auto">
          {[
            { key: 'dashboard', label: 'Dashboard', icon: BarChart3 },
            { key: 'users', label: 'Usuários', icon: Users },
            { key: 'permissions', label: 'Permissões', icon: Lock },
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
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
                }`}
              >
                <Icon className="mr-2 inline-block h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {activeTab === 'dashboard' ? (
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
                  <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${card.iconClassName}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white/80 p-8 text-center dark:border-slate-700 dark:bg-slate-900/70">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
            Esta aba permanece somente visual neste refactor.
          </p>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            O fluxo real de criação continua disponível pelo botão &quot;Novo Usuário&quot;.
          </p>
        </div>
      )}

      <CreateUserModal
        isOpen={isCreateModalOpen}
        onClose={handleCloseCreateModal}
        onUserCreated={handleUserCreated}
        departments={TEMPORARY_DEPARTMENTS}
        organizationId={organizationId}
        organizationIdLoading={isLoadingOrganizationId}
        invitedBy={user?.id}
      />
    </div>
  );
}
