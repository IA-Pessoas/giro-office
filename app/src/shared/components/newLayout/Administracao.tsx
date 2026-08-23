import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { BarChart3, KeyRound, Lock, Plus, RotateCcw, Save, Search, Shield, Users } from "lucide-react";
import { useRouter } from "next/router";
import { toast } from "react-toastify";

import { departmentService, type DepItem } from "@modules/departments";
import { AdminUserDetailsPanel, CreateUserModal, userService, type UserItem } from "@modules/users";
import {
  canAccessAdministration,
  canCreateOrganizationOwner,
  resolveDepartmentModuleKey,
  useModuleAccess,
} from "@modules/auth";
import {
  PERMISSION_MODULE_GROUPS,
  PERMISSION_SELECT_OPTIONS,
  getPermissionModuleLabel,
  getPermissionSelectOptions,
  normalizePermissionForModule,
} from "@modules/users/constants/permissionConfig";
import { permissionService } from "@modules/users/services/permissionService";
import {
  ADMIN_USER_STATUS_LABELS,
  type AdminUserStatus,
  getAdminUserStatusLabel,
  listAdminUsers,
} from "@modules/users/services/adminUsersService";
import type { PermissionDraft } from "@modules/users/types";
import {
  arePermissionDraftsEqual,
  buildPermissionUpdatePayload,
  freezePermissionSnapshot,
  isOwnerUser,
  normalizePermissionDraft,
  normalizePermissionResponse,
} from "@modules/users/utils/permissionUtils";
import {
  buildDepartmentPermissionSyncPayload,
  needsDepartmentPermissionSync,
} from "@modules/users/utils/createUserPayload";
import { signOut, useAuth } from "@/context/AuthContext";
import { ConfirmationDialog } from "@shared/components";
import { setupAPIClient } from "@shared/services/api";
import { useFetch } from "@shared/hooks";

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

type PermissionQueryResult = {
  userId: string;
  raw: Record<string, unknown>;
};

type PermissionSelectValue = (typeof PERMISSION_SELECT_OPTIONS)[number]["value"];

const adminUsersRootQueryKey = ["admin-users"] as const;
const adminUsersSummaryRootQueryKey = ["admin-users-summary"] as const;
const adminUsersQueryKey = (status: AdminUserStatus) => [...adminUsersRootQueryKey, status] as const;

function getPermissionSelectValue(value: number | null | undefined): PermissionSelectValue {
  if (value === 0 || value === 1 || value === 2 || value === 3) {
    return String(value) as Exclude<PermissionSelectValue, "null">;
  }

  return "0";
}

function getPermissionErrorMessage(error: unknown, fallbackMessage: string): string {
  if (isAxiosError(error)) {
    const responseMessage = error.response?.data?.error;
    if (typeof responseMessage === "string" && responseMessage.trim().length > 0) {
      return responseMessage;
    }
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return fallbackMessage;
}

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
  const [organizationId, setOrganizationId] = useState<string | undefined>(undefined);
  const [isLoadingOrganizationId, setIsLoadingOrganizationId] = useState(false);
  const [userStatusFilter, setUserStatusFilter] = useState<AdminUserStatus>("active");
  const [searchTerm, setSearchTerm] = useState("");
  const [permissionSearchTerm, setPermissionSearchTerm] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedPermissionUserId, setSelectedPermissionUserId] = useState<string | null>(null);
  const [pendingPermissionUserId, setPendingPermissionUserId] = useState<string | null>(null);
  const [permissionDraft, setPermissionDraft] = useState<PermissionDraft>(() =>
    normalizePermissionDraft({}),
  );
  const [permissionSnapshot, setPermissionSnapshot] = useState<Readonly<PermissionDraft> | null>(
    null,
  );
  const [permissionBaseline, setPermissionBaseline] = useState<
    Readonly<Record<string, unknown>> | null
  >(null);
  const [permissionExtraKeys, setPermissionExtraKeys] = useState<string[]>([]);
  const [loadedPermissionUserId, setLoadedPermissionUserId] = useState<string | null>(null);
  const [permissionSaveError, setPermissionSaveError] = useState<string | null>(null);
  const [isSavingPermissions, setIsSavingPermissions] = useState(false);
  const { user } = useAuth();
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
  const {
    data: permissionUsers = [],
    isLoading: isPermissionUsersLoading,
    error: permissionUsersError,
    refetch: refetchPermissionUsers,
  } = useFetch(
    ["admin-users-summary", "permissions-active"],
    () => listAdminUsers("active"),
    {
      enabled: hasAdminAccess && canManagePermissions && activeTab === "permissions",
      retry: false,
    },
  );
  const {
    data: departments = [],
    error: departmentsError,
    isLoading: isDepartmentsLoading,
    refetch: refetchDepartments,
  } = useFetch<DepItem[]>(["admin-departments"], () => departmentService.list(), {
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

  const filteredPermissionUsers = useMemo(() => {
    const normalizedSearch = normalizeSearchText(permissionSearchTerm);

    if (!normalizedSearch) {
      return permissionUsers;
    }

    return permissionUsers.filter((candidate) => {
      const departmentName =
        departmentNameById.get(candidate.department_id) ?? candidate.department?.name ?? "";
      const searchableValues = [
        candidate.name,
        candidate.login,
        departmentName,
        getAdminUserStatusLabel(candidate.status),
      ];

      return searchableValues.some((value) => normalizeSearchText(value).includes(normalizedSearch));
    });
  }, [departmentNameById, permissionSearchTerm, permissionUsers]);

  const selectedPermissionUser = useMemo(() => {
    return permissionUsers.find((candidate) => candidate.id === selectedPermissionUserId) ?? null;
  }, [permissionUsers, selectedPermissionUserId]);
  const selectedPermissionDepartmentModule = useMemo(() => {
    if (!selectedPermissionUser) {
      return null;
    }

    const departmentName =
      departmentNameById.get(selectedPermissionUser.department_id) ??
      selectedPermissionUser.department?.name ??
      null;

    return resolveDepartmentModuleKey(departmentName);
  }, [departmentNameById, selectedPermissionUser]);
  const normalizedPermissionDraft = useMemo(() => {
    return normalizePermissionDraft(permissionDraft, permissionExtraKeys);
  }, [permissionDraft, permissionExtraKeys]);
  const isDirty = useMemo(() => {
    if (!permissionSnapshot) {
      return false;
    }

    return (
      !arePermissionDraftsEqual(normalizedPermissionDraft, permissionSnapshot) ||
      needsDepartmentPermissionSync(
        selectedPermissionDepartmentModule,
        normalizedPermissionDraft,
        selectedPermissionUser,
        permissionBaseline ?? undefined,
      )
    );
  }, [
    normalizedPermissionDraft,
    permissionBaseline,
    permissionSnapshot,
    selectedPermissionDepartmentModule,
    selectedPermissionUser,
  ]);
  const isSelectedPermissionOwner = isOwnerUser(selectedPermissionUser);

  const permissionQuery = useQuery<PermissionQueryResult>({
    queryKey: ["admin", "permissions", selectedPermissionUserId],
    enabled:
      hasAdminAccess &&
      canManagePermissions &&
      activeTab === "permissions" &&
      !!selectedPermissionUserId,
    retry: false,
    queryFn: async ({ queryKey, signal }) => {
      const [, , userId] = queryKey as [string, string, string];
      const raw = await permissionService.getByUserId(userId, undefined, { signal });

      return {
        userId,
        raw,
      };
    },
  });

  const managedModulesCount = useMemo(() => {
    return PERMISSION_MODULE_GROUPS.reduce((total, group) => total + group.keys.length, 0);
  }, []);

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
        console.error("Erro ao carregar organization_id do usuário logado", error);
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

  useEffect(() => {
    if (permissionUsers.length === 0) {
      setSelectedPermissionUserId(null);
      return;
    }

    setSelectedPermissionUserId((currentSelectedPermissionUserId) => {
      if (
        currentSelectedPermissionUserId &&
        permissionUsers.some((candidate) => candidate.id === currentSelectedPermissionUserId)
      ) {
        return currentSelectedPermissionUserId;
      }

      return permissionUsers[0]?.id ?? null;
    });
  }, [permissionUsers]);

  useEffect(() => {
    if (!selectedPermissionUserId) {
      setPermissionDraft(normalizePermissionDraft({}));
      setPermissionSnapshot(null);
      setPermissionBaseline(null);
      setPermissionExtraKeys([]);
      setLoadedPermissionUserId(null);
      setPermissionSaveError(null);
      return;
    }

    if (selectedPermissionUserId !== loadedPermissionUserId) {
      setPermissionDraft(normalizePermissionDraft({}));
      setPermissionSnapshot(null);
      setPermissionBaseline(null);
      setPermissionExtraKeys([]);
      setPermissionSaveError(null);
    }
  }, [loadedPermissionUserId, selectedPermissionUserId]);

  useEffect(() => {
    if (
      hasAdminAccess &&
      permissionQuery.isError &&
      isAxiosError(permissionQuery.error) &&
      permissionQuery.error.response?.status === 403
    ) {
      void router.replace("/dashboard");
    }
  }, [hasAdminAccess, permissionQuery.error, permissionQuery.isError, router]);

  useEffect(() => {
    if (
      hasAdminAccess &&
      ((isAxiosError(usersError) && usersError.response?.status === 403) ||
        (isAxiosError(permissionUsersError) && permissionUsersError.response?.status === 403))
    ) {
      void router.replace("/dashboard");
    }
  }, [hasAdminAccess, permissionUsersError, router, usersError]);

  useEffect(() => {
    if (!permissionQuery.data) {
      return;
    }

    if (permissionQuery.data.userId !== selectedPermissionUserId) {
      return;
    }

    const normalizationResult = normalizePermissionResponse(permissionQuery.data.raw);
    const nextExtraKeys = Object.keys(normalizationResult.extras);
    const nextDraft = normalizePermissionDraft(
      {
        ...normalizationResult.known,
        ...normalizationResult.extras,
      },
      nextExtraKeys,
    );

    setPermissionDraft(nextDraft);
    setPermissionSnapshot(freezePermissionSnapshot(nextDraft));
    setPermissionBaseline(permissionQuery.data.raw);
    setPermissionExtraKeys(nextExtraKeys);
    setLoadedPermissionUserId(permissionQuery.data.userId);
    setPermissionSaveError(null);
  }, [permissionQuery.data, selectedPermissionUserId]);

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

  const isPermissionQuery404 =
    isAxiosError(permissionQuery.error) && permissionQuery.error.response?.status === 404;
  const canShowPermissionLoader =
    permissionQuery.isLoading ||
    (permissionQuery.isFetching && loadedPermissionUserId !== selectedPermissionUserId);

  const getDepartmentName = (candidate: UserItem): string => {
    return (
      departmentNameById.get(candidate.department_id) ??
      candidate.department?.name ??
      "Sem departamento"
    );
  };
  const handleSelectPermissionUser = (nextUserId: string) => {
    if (nextUserId === selectedPermissionUserId || isSavingPermissions) {
      return;
    }

    if (isDirty) {
      setPendingPermissionUserId(nextUserId);
      return;
    }

    setSelectedPermissionUserId(nextUserId);
  };
  const handleConfirmPermissionUserChange = () => {
    if (!pendingPermissionUserId) {
      return;
    }

    setSelectedPermissionUserId(pendingPermissionUserId);
  };
  const handlePermissionChange = (moduleKey: string, nextValue: PermissionSelectValue) => {
    const normalizedValue = normalizePermissionForModule(
      moduleKey,
      Number(nextValue),
    );

    setPermissionDraft((currentDraft) =>
      normalizePermissionDraft(
        {
          ...currentDraft,
          [moduleKey]: normalizedValue,
        },
        permissionExtraKeys,
      ),
    );
    setPermissionSaveError(null);
  };
  const handleSavePermissions = async () => {
    if (!selectedPermissionUserId || !permissionSnapshot || isSelectedPermissionOwner) {
      return;
    }

    if (isSavingPermissions) {
      return;
    }

    const payload = buildPermissionUpdatePayload(permissionDraft, permissionExtraKeys);
    const shouldSyncDepartmentPermission = needsDepartmentPermissionSync(
      selectedPermissionDepartmentModule,
      payload,
      selectedPermissionUser,
    );

    if (arePermissionDraftsEqual(payload, permissionSnapshot) && !shouldSyncDepartmentPermission) {
      return;
    }

    setIsSavingPermissions(true);
    setPermissionSaveError(null);

    try {
      const raw = shouldSyncDepartmentPermission
        ? await (async () => {
            if (!selectedPermissionDepartmentModule) {
              throw new Error("Módulo do departamento não encontrado.");
            }

            await userService.update(
              selectedPermissionUserId,
              buildDepartmentPermissionSyncPayload(selectedPermissionDepartmentModule, payload),
            );

            return permissionService.getByUserId(selectedPermissionUserId);
          })()
        : await permissionService.update(selectedPermissionUserId, payload);
      const normalizationResult = normalizePermissionResponse(raw);
      const nextExtraKeys = Object.keys(normalizationResult.extras);
      const nextDraft = normalizePermissionDraft(
        {
          ...normalizationResult.known,
          ...normalizationResult.extras,
        },
        nextExtraKeys,
      );

      setPermissionDraft(nextDraft);
      setPermissionSnapshot(freezePermissionSnapshot(nextDraft));
      setPermissionBaseline(raw);
      setPermissionExtraKeys(nextExtraKeys);
      setLoadedPermissionUserId(selectedPermissionUserId);
      setPermissionSaveError(null);
      queryClient.setQueryData(["admin", "permissions", selectedPermissionUserId], {
        userId: selectedPermissionUserId,
        raw,
      });

      try {
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: ["admin", "permissions", selectedPermissionUserId],
          }),
          invalidateAdminUserLists(),
        ]);
      } catch {
        toast.warn(
          "Permissões salvas, mas a lista de acessos não pôde ser atualizada agora.",
        );
      }

      if (selectedPermissionUserId === user?.id) {
        signOut("Permissões atualizadas. Entre novamente para aplicar os novos acessos.");
        return;
      }
      toast.success("Permissões atualizadas com sucesso.");
    } catch (error) {
      setPermissionSaveError(
        getPermissionErrorMessage(error, "Não foi possível salvar as permissões agora."),
      );
    } finally {
      setIsSavingPermissions(false);
    }
  };

  if (isAdministrationAccessLoading) {
    return (
      <div className={ADMIN_FEEDBACK_PANEL_CLASSNAME}>
        <p className={ADMIN_TEXT_CLASSNAME}>Carregando acesso de administracao.</p>
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
                    {filteredUsers.length} usuário{filteredUsers.length === 1 ? "" : "s"}
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
            />
          </section>
        </div>
      ) : (
        <div className="grid gap-4 xl:h-[575px] xl:grid-cols-[350px_minmax(0,1fr)] xl:items-stretch">
          <aside className={`${ADMIN_PANEL_CLASSNAME} overflow-hidden p-4 max-xl:h-[680px] xl:h-full`}>
            <div className="flex h-full min-h-0 flex-col space-y-4">
              <div className="space-y-1">
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                  Usuários ativos
                </h2>
                <p className={ADMIN_MUTED_CLASSNAME}>
                  Escolha um usuário para carregar e editar as permissões.
                </p>
              </div>

              {permissionUsersError ? (
                <div className={ADMIN_FEEDBACK_PANEL_CLASSNAME}>
                  <p className={ADMIN_TEXT_CLASSNAME}>
                    Não foi possível carregar os usuários ativos.
                  </p>
                  <button
                    type="button"
                    onClick={() => void refetchPermissionUsers()}
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
                    value={permissionSearchTerm}
                    onChange={(event) => setPermissionSearchTerm(event.target.value)}
                    placeholder="Buscar usuário ativo"
                    disabled={isPermissionUsersLoading || Boolean(permissionUsersError)}
                    className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-900 shadow-sm outline-none transition-all placeholder:text-slate-400 focus:border-[var(--colors-brand-gradient-end)] focus:ring-2 focus:ring-[var(--colors-brand-gradient-start)]/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500"
                  />
                </div>
              </div>

              <div className="flex min-h-0 flex-1 flex-col space-y-3">
                <div className="flex items-center justify-between">
                  <p className={ADMIN_TEXT_CLASSNAME}>
                    {filteredPermissionUsers.length} de {permissionUsers.length} usuário
                    {permissionUsers.length === 1 ? "" : "s"}
                  </p>
                  <span className="rounded-full bg-[var(--colors-brand-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--colors-brand-strong)] dark:bg-blue-900/30 dark:text-blue-300">
                    Ativo
                  </span>
                </div>

                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                  {isPermissionUsersLoading ? (
                    <div className={ADMIN_EMPTY_STATE_CLASSNAME}>
                      <p className={ADMIN_MUTED_CLASSNAME}>Carregando usuários ativos...</p>
                    </div>
                  ) : permissionUsersError ? (
                    <div className={ADMIN_EMPTY_STATE_CLASSNAME}>
                      <p className={ADMIN_MUTED_CLASSNAME}>
                        A listagem de usuários ativos não está disponível.
                      </p>
                    </div>
                  ) : permissionUsers.length === 0 ? (
                    <div className={ADMIN_EMPTY_STATE_CLASSNAME}>
                      <p className={ADMIN_TEXT_CLASSNAME}>Nenhum usuário ativo encontrado.</p>
                    </div>
                  ) : filteredPermissionUsers.length === 0 ? (
                    <div className={ADMIN_EMPTY_STATE_CLASSNAME}>
                      <p className={ADMIN_TEXT_CLASSNAME}>
                        Nenhum usuário ativo corresponde à busca.
                      </p>
                    </div>
                  ) : (
                    filteredPermissionUsers.map((candidate) => {
                      const isSelected = candidate.id === selectedPermissionUserId;

                      return (
                        <button
                          key={candidate.id}
                          type="button"
                          onClick={() => handleSelectPermissionUser(candidate.id)}
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
                                {getDepartmentName(candidate)}
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
            {!selectedPermissionUser ? (
              <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-8 text-center dark:border-slate-700 dark:bg-slate-950/30">
                <div>
                  <p className={ADMIN_TEXT_CLASSNAME}>
                    Selecione um usuário para editar as permissões.
                  </p>
                </div>
              </div>
            ) : canShowPermissionLoader ? (
              <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-8 text-center dark:border-slate-700 dark:bg-slate-950/30">
                <div>
                  <p className={ADMIN_TEXT_CLASSNAME}>Carregando permissões...</p>
                </div>
              </div>
            ) : permissionQuery.isError ? (
              <div className="flex h-full items-center rounded-2xl border border-amber-200 bg-amber-50/90 p-8 text-slate-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-white">
                <div>
                  <p className="text-sm font-semibold">
                    {isPermissionQuery404
                      ? "Permissões não configuradas para este usuário. Solicite criação/configuração via suporte."
                      : "Não foi possível carregar as permissões deste usuário."}
                  </p>
                  <button
                    type="button"
                    onClick={() => void permissionQuery.refetch()}
                    className="mt-4 inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    disabled={permissionQuery.isFetching}
                  >
                    <RotateCcw className="h-4 w-4" />
                    Tentar novamente
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex h-full min-h-0 flex-col">
                <div className="space-y-1 pb-6">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                      {selectedPermissionUser.name}
                    </h2>
                    {isSelectedPermissionOwner ? (
                      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-slate-900 dark:bg-amber-950/50 dark:text-white">
                        Owner
                      </span>
                    ) : null}
                    {isDirty ? (
                      <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-800 dark:bg-sky-950/50 dark:text-sky-200">
                        Alterações pendentes
                      </span>
                    ) : null}
                  </div>
                  <p className={ADMIN_MUTED_CLASSNAME}>
                    {getDepartmentName(selectedPermissionUser)} -{" "}
                    {getAdminUserStatusLabel(selectedPermissionUser.status)}
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pb-6">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-slate-700 dark:text-white">
                      Níveis da permissão por módulo
                    </p>
                    <p className={ADMIN_MUTED_CLASSNAME}>
                      Ajuste apenas acessos complementares ao módulo principal do usuário selecionado.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleSavePermissions()}
                    className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-all ${
                      isDirty && !isSelectedPermissionOwner && !isSavingPermissions
                        ? `${ADMIN_GRADIENT_BUTTON_CLASSNAME}`
                        : "bg-slate-300 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                    }`}
                    disabled={!isDirty || isSelectedPermissionOwner || isSavingPermissions}
                  >
                    <Save className="h-4 w-4" />
                    {isSavingPermissions ? "Salvando..." : "Salvar permissões"}
                  </button>
                </div>

                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
                  {permissionSaveError ? (
                    <div className="rounded-2xl border border-rose-200 bg-rose-50/90 p-4 text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-100">
                      <p className="text-sm font-semibold">Não foi possível salvar as permissões.</p>
                      <p className="mt-1 text-sm opacity-90">{permissionSaveError}</p>
                      <button
                        type="button"
                        onClick={() => void handleSavePermissions()}
                        className="mt-3 inline-flex items-center gap-2 rounded-xl border border-rose-200 px-4 py-2 text-sm font-medium text-rose-900 transition-colors hover:bg-rose-100 dark:border-rose-900/60 dark:text-rose-100 dark:hover:bg-rose-900/30"
                        disabled={isSelectedPermissionOwner || isSavingPermissions}
                      >
                        <RotateCcw className="h-4 w-4" />
                        Tentar novamente
                      </button>
                    </div>
                  ) : null}

                  {isSelectedPermissionOwner ? (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50/90 p-4 text-slate-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-white">
                      <p className="text-sm font-semibold">
                        Owners recebem acesso máximo e não são editáveis nesta tela.
                      </p>
                    </div>
                  ) : null}

                  <div className="grid gap-4 xl:grid-cols-2">
                    {PERMISSION_MODULE_GROUPS.map((group) => (
                      <section key={group.title} className={`${ADMIN_SUBPANEL_CLASSNAME} p-4`}>
                        <div className="space-y-1">
                          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                            {group.title}
                          </h3>
                        </div>

                        <div className="mt-4 space-y-3">
                          {group.keys.map((moduleKey) => {
                            const isDepartmentModule = selectedPermissionDepartmentModule === moduleKey;
                            const moduleLabel = getPermissionModuleLabel(moduleKey);

                            return (
                              <div
                                key={moduleKey}
                                className="grid gap-2 2xl:grid-cols-[minmax(0,1fr)_200px] 2xl:items-center"
                              >
                                <label
                                  className="flex max-w-full items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200"
                                  title={
                                    isDepartmentModule
                                      ? `${moduleLabel} - módulo vinculado ao departamento do usuário`
                                      : moduleLabel
                                  }
                                >
                                  <span className="min-w-0 truncate">{moduleLabel}</span>
                                  {isDepartmentModule ? (
                                    <span className="shrink-0 rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                      Departamento
                                    </span>
                                  ) : null}
                                </label>
                                <select
                                  value={getPermissionSelectValue(normalizedPermissionDraft[moduleKey])}
                                  onChange={(event) =>
                                    handlePermissionChange(
                                      moduleKey,
                                      event.target.value as PermissionSelectValue,
                                    )
                                  }
                                  className={ADMIN_SELECT_CLASSNAME}
                                  style={ADMIN_SELECT_ARROW_STYLE}
                                  disabled={isSelectedPermissionOwner || isSavingPermissions}
                                >
                                  {getPermissionSelectOptions(moduleKey).map((option) => (
                                    <option key={option.value} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            );
                          })}
                        </div>
                      </section>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      <CreateUserModal
        isOpen={isCreateModalOpen}
        onClose={handleCloseCreateModal}
        onUserCreated={handleUserCreated}
        departments={departments}
        departmentsLoading={isDepartmentsLoading}
        departmentsError={Boolean(departmentsError)}
        onRetryDepartments={handleRetryDepartments}
        organizationId={organizationId}
        organizationIdLoading={isLoadingOrganizationId}
        invitedBy={user?.id}
        canCreateOrganizationOwner={canManageOrganizationOwners}
      />

      <ConfirmationDialog
        open={pendingPermissionUserId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingPermissionUserId(null);
          }
        }}
        title="Descartar alterações pendentes?"
        description="Existem alterações pendentes para este usuário. Ao trocar de contexto, elas serão descartadas."
        onConfirm={handleConfirmPermissionUserChange}
        isConfirming={false}
        errorMessage={null}
        confirmLabel="Descartar e trocar"
        cancelLabel="Continuar editando"
        variant="destructive"
      />
    </div>
  );
}
