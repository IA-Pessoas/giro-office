import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@shared/services/toast";
import {
  BadgeDollarSign,
  Bot,
  Bell,
  Building2,
  Calculator,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Code,
  FileText,
  FileCheck,
  LayoutDashboard,
  Loader2,
  Menu,
  Megaphone,
  Receipt,
  Search,
  Settings,
  Shield,
  ShieldCheck,
  SquareCheck,
  ListChecks,
  ContactRound,
  FolderKanban,
  UserRoundCog,
  Users,
  X,
} from "lucide-react";

import {
  APP_ROUTE_MODULE_MAP,
  canViewIntegrationRoute,
  isIntegrationTasksOnlyRouteBlocked,
  hasAnyModuleAccess,
  MODULE_KEYS,
  getModulePermissionLevel,
  canAccessAdministration,
  canCreateOrganizationOwner,
  normalizeRoutePath,
  useModuleAccessMap,
  type ModuleKey,
  type ModulePermissionSubject,
} from "@modules/auth";
import {
  useMarkRhNotificationReadMutation,
  useRhNotifications,
} from "@modules/rh/hooks/useRhRequests";
import { useNewTiRequestAlerts } from "@modules/ti/hooks/useNewTiRequestAlerts";
import { useClickOutside, useFetch, useMe } from "@shared/hooks";
import { taskOperationalNotificationService } from "@shared/services/taskOperationalNotificationService";
import { SYSTEM_VERTICAL_SCROLL_AREA_CLASSNAME } from "@shared/ui/newLayout/scrollbar";
import { resolvePhotoUrl } from "@shared/utils";
import { useAuth } from "../../../context/AuthContext";

function getInitials(name: string): string {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "AD"
  );
}

function Logo({ showText }: { showText: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <svg
        width="32"
        height="32"
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="flex-shrink-0"
      >
        <path d="M16 4L26 10V22L16 28L6 22V10L16 4Z" fill="#3b82f6" opacity="0.9" />
        <path d="M16 4L26 10L16 16L16 28L26 22V10L16 4Z" fill="#60a5fa" opacity="0.7" />
        <path d="M16 4L6 10L16 16L16 28L6 22V10L16 4Z" fill="#2563eb" opacity="0.5" />
        <path
          d="M16 4L26 10M16 4L6 10M16 28L26 22M16 28L6 22M26 10V22M6 10V22M16 16V28"
          stroke="#1e40af"
          strokeWidth="1"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.3"
        />
      </svg>

      {showText ? (
        <span className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">
          Office
        </span>
      ) : null}
    </div>
  );
}

type NavigationModule = {
  path: string;
  name: string;
  icon: typeof LayoutDashboard;
  moduleKey?: ModuleKey;
  platformOnly?: boolean;
};

type NavigationCategory = {
  name: string;
  modules: NavigationModule[];
  isModuleAccessCategory?: boolean;
};

const moduleCategories: NavigationCategory[] = [
  {
    name: "Principal",
    modules: [
      { path: "/dashboard", name: "Dashboard", icon: LayoutDashboard },
      { path: "/clients", name: "Clientes", icon: ContactRound },
      { path: "/projects", name: "Projetos", icon: FolderKanban },
      { path: "/tasks", name: "Tarefas", icon: SquareCheck },
      { path: "/relatorios", name: "Relatórios", icon: FileText },
      { path: "/departments", name: "Departamentos", icon: Building2 },
    ],
  },
  {
    name: "Módulos",
    isModuleAccessCategory: true,
    modules: [
      {
        path: "/certificados",
        name: "Certificados",
        icon: FileCheck,
        moduleKey: "certificado" as ModuleKey,
      },
      {
        path: "/regularize",
        name: "Regularize",
        icon: ShieldCheck,
        moduleKey: "regularize" as ModuleKey,
      },
      { path: "/fiscal", name: "Fiscal", icon: Receipt, moduleKey: "fiscal" as ModuleKey },
      { path: "/contabil", name: "Contábil", icon: Calculator },
      { path: "/triagem", name: "Triagem", icon: ListChecks, moduleKey: "triagem" as ModuleKey },
      { path: "/parcelamento", name: "Parcelamento", icon: BadgeDollarSign, moduleKey: "parcelamento" as ModuleKey },
      { path: "/rh", name: "RH", icon: Users, moduleKey: "rh" as ModuleKey },
      {
        path: "/departamento-pessoal",
        name: "Dep. Pessoal",
        icon: UserRoundCog,
        moduleKey: "pessoal" as ModuleKey,
      },
      { path: "/tecnologia", name: "Tecnologia", icon: Code, moduleKey: "ti" as ModuleKey },
      { path: "/comercial", name: "Comercial", icon: BadgeDollarSign, moduleKey: "comercial" as ModuleKey },
      { path: "/marketing", name: "Marketing", icon: Megaphone, moduleKey: "marketing" as ModuleKey },
    ],
  },
  {
    name: "Sistema",
    modules: [{ path: "/configuracoes", name: "Configurações", icon: Settings }],
  },
  {
    name: "Admin",
    modules: [
      { path: "/super-admin", name: "Super Admin", icon: ShieldCheck, platformOnly: true },
      { path: "/administracao", name: "Administração", icon: Shield },
    ],
  },
];

const MODULE_ACCESS_DENIED_MESSAGE = "Você não tem acesso a este módulo no perfil atual.";
const MODULE_ACCESS_LOADING_MESSAGE = "Carregando acesso ao módulo.";
const MODULE_NAV_LOADING_MESSAGE = "Carregando módulos";
const NOTIFICATIONS_PANEL_ID = "app-shell-notifications-panel";
const USER_MENU_PANEL_ID = "app-shell-user-menu";
// O assistente ainda não tem backend de IA; fica oculto fora de ambientes de teste (#1339).
const AI_ASSISTANT_ENABLED = process.env.NEXT_PUBLIC_AI_ASSISTANT_ENABLED === "true";

function formatAppShellNotificationTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function getModuleKeyFromRoutePath(routePath: string): ModuleKey | null {
  const normalizedPath = normalizeRoutePath(routePath);

  if (normalizedPath.startsWith("/clients/") && normalizedPath.includes("/commercial")) {
    return "comercial";
  }
  if (normalizedPath.startsWith("/clients/") && normalizedPath.includes("/contabil")) {
    return "contabil";
  }
  if (normalizedPath.startsWith("/clients/") && normalizedPath.includes("/finance")) {
    return "financeiro";
  }
  if (normalizedPath.startsWith("/clients/") && normalizedPath.includes("/integration")) {
    return "integracao";
  }
  if (normalizedPath.startsWith("/clients/") && normalizedPath.includes("/regularize")) {
    return "regularize";
  }
  if (normalizedPath.startsWith("/clients/") && normalizedPath.includes("/pa")) {
    return "pessoal";
  }

  const mappedRoute = Object.entries(APP_ROUTE_MODULE_MAP).find(([modulePath]) => {
    return normalizedPath === modulePath || normalizedPath.startsWith(`${modulePath}/`);
  });

  if (mappedRoute) {
    const [, mappedModuleKey] = mappedRoute;
    return mappedModuleKey ?? null;
  }

  for (const category of moduleCategories) {
    const matchedModule = category.modules.find((module) => {
      return normalizeRoutePath(module.path) === normalizedPath;
    });

    if (matchedModule && "moduleKey" in matchedModule) {
      return matchedModule.moduleKey;
    }
  }

  return null;
}

function getNavigationModuleName(
  module: NavigationModule,
  accessUser: ModulePermissionSubject,
): string {
  if (module.path === "/tasks" && getModulePermissionLevel(accessUser, "integracao") === 0) {
    return "Minhas tarefas";
  }

  return module.name;
}

function ModuleAccessDeniedState({
  fallbackHref = "/dashboard",
  fallbackLabel = "Voltar para o dashboard",
}: {
  fallbackHref?: string;
  fallbackLabel?: string;
}) {
  return (
    <section className="mx-auto flex min-h-[60vh] max-w-3xl items-center justify-center">
      <div className="rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300">
          <Shield className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-semibold text-slate-950 dark:text-white">
          Acesso indisponível
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
          {MODULE_ACCESS_DENIED_MESSAGE}
        </p>
        <Link
          href={fallbackHref}
          className="mt-6 inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          {fallbackLabel}
        </Link>
      </div>
    </section>
  );
}

function ModuleAccessLoadingState() {
  return (
    <section
      aria-busy="true"
      aria-live="polite"
      className="mx-auto flex min-h-[60vh] max-w-3xl items-center justify-center"
    >
      <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-5 py-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <Loader2
          aria-hidden="true"
          className="h-5 w-5 animate-spin text-blue-600 dark:text-blue-300"
        />
        <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
          {MODULE_ACCESS_LOADING_MESSAGE}
        </span>
      </div>
    </section>
  );
}

function ModuleNavLoadingItem({ showText }: { showText: boolean }) {
  return (
    <div
      role="status"
      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-gray-500 dark:text-slate-400 ${
        !showText ? "justify-center" : ""
      }`}
      title={!showText ? MODULE_NAV_LOADING_MESSAGE : undefined}
    >
      <Loader2 aria-hidden="true" className="h-5 w-5 flex-shrink-0 animate-spin" />
      {showText ? <span className="text-sm font-medium">{MODULE_NAV_LOADING_MESSAGE}</span> : null}
    </div>
  );
}

type ChatMessage = {
  id: string;
  sender: "user" | "ai";
  text: string;
  time: string;
};

type AppShellNotification = {
  id: string;
  notificationId: string;
  source: "rh" | "task";
  requestId?: string;
  taskId?: string;
  title: string;
  description: string;
  time: string;
  unread: boolean;
  createdAt: string;
};

function ImpersonationCountdown({
  expiresAt,
  onExpired,
}: {
  expiresAt: string;
  onExpired: () => void;
}) {
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const onExpiredRef = useRef(onExpired);
  const handledExpiryRef = useRef<string | null>(null);
  onExpiredRef.current = onExpired;

  useEffect(() => {
    const expiresAtMs = Date.parse(expiresAt);
    if (!Number.isFinite(expiresAtMs)) {
      setRemainingSeconds(null);
      handledExpiryRef.current = null;
      return;
    }

    const updateRemainingTime = () => {
      const remaining = Math.max(0, Math.ceil((expiresAtMs - Date.now()) / 1000));
      setRemainingSeconds(remaining);
      if (remaining === 0 && handledExpiryRef.current !== expiresAt) {
        handledExpiryRef.current = expiresAt;
        onExpiredRef.current();
      }
    };

    updateRemainingTime();
    const interval = window.setInterval(updateRemainingTime, 1000);
    return () => window.clearInterval(interval);
  }, [expiresAt]);

  const timeRemaining =
    remainingSeconds === null
      ? "--:--"
      : `${Math.floor(remainingSeconds / 60)
          .toString()
          .padStart(2, "0")}:${(remainingSeconds % 60).toString().padStart(2, "0")}`;

  return (
    <span className="shrink-0 tabular-nums text-xs" aria-live="off">
      Tempo restante: {timeRemaining}
    </span>
  );
}

export function AppShell({
  children,
  isIframeView = false,
}: {
  children: React.ReactNode;
  isIframeView?: boolean;
}) {
  const router = useRouter();
  const { user, logoutUser, exitImpersonation, expireImpersonation } = useAuth();
  const [isExitingImpersonation, setIsExitingImpersonation] = useState(false);
  const impersonation = user?.impersonation;
  const impersonationBanner = impersonation ? (
    <div
      className="fixed inset-x-0 top-0 z-[60] flex h-12 items-center justify-between gap-3 border-b border-amber-300 bg-amber-50 px-4 text-sm font-semibold text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
      role="status"
    >
      <span className="min-w-0 truncate">
        Você está personificando {user.name} ({impersonation.organization_name})
      </span>
      <ImpersonationCountdown
        expiresAt={impersonation.expires_at}
        onExpired={expireImpersonation}
      />
      <button
        type="button"
        className="shrink-0 rounded-md border border-amber-500 px-3 py-1 text-xs font-bold hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700 disabled:cursor-wait disabled:opacity-60 dark:hover:bg-amber-900"
        disabled={isExitingImpersonation}
        onClick={() => {
          setIsExitingImpersonation(true);
          void exitImpersonation()
            .catch(() => undefined)
            .finally(() => setIsExitingImpersonation(false));
        }}
      >
        {isExitingImpersonation ? "Saindo…" : "Sair da personificação"}
      </button>
    </div>
  ) : null;
  const isPlatformSuperAdmin =
    user?.auth_kind === "platform" && user.platform_role === "super_admin";
  const meQuery = useMe({ enabled: !isPlatformSuperAdmin });
  const notificationQuery = useFetch(
    ["task", "notifications"],
    () => taskOperationalNotificationService.list(),
    { enabled: !isPlatformSuperAdmin && Boolean(user) },
  );
  const queryClient = useQueryClient();
  const markNotificationRead = useMutation({
    mutationFn: taskOperationalNotificationService.markRead,
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["task", "notifications"] }),
  });
  const {
    accessMap: moduleAccessMap,
    isLoading: isModuleAccessLoading,
    user: moduleAccessUser,
  } = useModuleAccessMap(MODULE_KEYS);
  const rhNotificationsQuery = useRhNotifications({
    enabled: !isPlatformSuperAdmin && moduleAccessMap.rh?.canView === true,
  });
  const markRhNotificationReadMutation = useMarkRhNotificationReadMutation();
  useNewTiRequestAlerts(!isPlatformSuperAdmin && moduleAccessMap.ti?.isAdmin === true);

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isSidebarPreviewOpen, setIsSidebarPreviewOpen] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showAiChat, setShowAiChat] = useState(false);
  const [aiQuery, setAiQuery] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [hasUserPhotoLoadError, setHasUserPhotoLoadError] = useState(false);
  const rhNotifications: AppShellNotification[] = (rhNotificationsQuery.data ?? []).map((item) => ({
    id: `rh:${item.id}`,
    notificationId: item.id,
    source: "rh" as const,
    requestId: item.request_id,
    title: item.title,
    description: item.message,
    time: formatAppShellNotificationTime(item.created_at),
    unread: !item.read,
    createdAt: item.created_at,
  }));
  const taskNotifications: AppShellNotification[] = (notificationQuery.data?.items ?? []).map(
    (item) => ({
      id: `task:${item.id}`,
      notificationId: item.id,
      source: "task" as const,
      taskId: item.task_id,
      title: item.title,
      description: item.message,
      time: formatAppShellNotificationTime(item.created_at),
      unread: item.read_at === null,
      createdAt: item.created_at,
    }),
  );
  const notifications = [...rhNotifications, ...taskNotifications].sort(
    (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt),
  );
  const isNotificationsLoading = notificationQuery.isLoading || rhNotificationsQuery.isLoading;
  const hasNotificationsError = notificationQuery.isError || rhNotificationsQuery.isError;
  const hasUnreadNotifications = notifications.some((item) => item.unread);
  const shouldExpandSidebar = isSidebarOpen || isSidebarPreviewOpen;
  const sidebarToggleLabel = isSidebarOpen
    ? "Recolher sidebar"
    : isSidebarPreviewOpen
      ? "Fixar sidebar aberta"
      : "Expandir sidebar";

  const sidebarRef = useRef<HTMLDivElement>(null);
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const aiChatTriggerRef = useRef<HTMLButtonElement | null>(null);
  // Clique fora fecha os popovers do cabeçalho sem backdrop: um backdrop invisível
  // engolia o primeiro clique no botão ou aba que o usuário queria acionar (#1363).
  const closeNotifications = useCallback(() => setShowNotifications(false), []);
  const closeUserMenu = useCallback(() => setShowUserMenu(false), []);
  const notificationsRef = useClickOutside(closeNotifications);
  const userMenuRef = useClickOutside(closeUserMenu);

  const pathname = router.asPath.split("?")[0] ?? "";
  const displayUserName = user?.name ?? meQuery.data?.name ?? "Admin";
  const displayUserLogin = user?.email ?? user?.login ?? meQuery.data?.login ?? "";
  const displayUserPhoto = resolvePhotoUrl(
    isPlatformSuperAdmin ? null : meQuery.data?.photo_url ?? null,
  );
  const displayUserInitials = getInitials(displayUserName);
  const accessUser = isPlatformSuperAdmin ? user : meQuery.data ?? user;
  const rhAccess = moduleAccessMap.rh;
  const canManageOrganization = canCreateOrganizationOwner(accessUser);
  const canManageUsers = canAccessAdministration(accessUser, { rhAccess });
  const isAdministrationAccessLoading = !canManageOrganization && isModuleAccessLoading;
  const isSelfProfileRoute = normalizeRoutePath(pathname) === "/me";
  const currentModuleKey = getModuleKeyFromRoutePath(pathname);
  const currentModuleAccess = currentModuleKey ? moduleAccessMap[currentModuleKey] : null;
  const shouldShowDashboard = isModuleAccessLoading || hasAnyModuleAccess(moduleAccessMap);
  const shouldRenderModuleAccessLoading = Boolean(currentModuleKey) && isModuleAccessLoading;
  const isCurrentRouteBlockedByIntegrationTasksOnly = isIntegrationTasksOnlyRouteBlocked(
    currentModuleKey,
    pathname,
    moduleAccessUser,
  );
  const canViewTasksOnlyRoute = !isCurrentRouteBlockedByIntegrationTasksOnly;
  const canViewCurrentModuleRoute =
    canViewTasksOnlyRoute &&
    (currentModuleKey === "integracao"
      ? canViewIntegrationRoute(pathname, moduleAccessUser)
      : currentModuleAccess?.canView === true);
  const shouldRenderModuleAccessDenied =
    !isSelfProfileRoute &&
    !isModuleAccessLoading &&
    ((!canViewTasksOnlyRoute && getModulePermissionLevel(moduleAccessUser, "integracao") === 0) ||
      (Boolean(currentModuleKey) && !canViewCurrentModuleRoute));

  const canViewModuleFromPath = (modulePath: string): boolean => {
    if (modulePath === "/dashboard") {
      return shouldShowDashboard;
    }

    if (modulePath === "/departments") {
      return canManageOrganization;
    }

    if (modulePath === "/administracao") {
      if (isAdministrationAccessLoading) {
        return true;
      }

      return canManageUsers;
    }

    const moduleKey = getModuleKeyFromRoutePath(modulePath);

    if (!moduleKey) {
      return true;
    }

    if (isModuleAccessLoading) {
      return true;
    }

    if (isIntegrationTasksOnlyRouteBlocked(moduleKey, modulePath, moduleAccessUser)) {
      return false;
    }

    if (moduleKey === "integracao") {
      return canViewIntegrationRoute(modulePath, moduleAccessUser);
    }

    const moduleAccess = moduleAccessMap[moduleKey];
    return Boolean(moduleAccess?.canView);
  };

  const filteredModuleCategories = moduleCategories
    .map((category) => {
      if (category.isModuleAccessCategory && isModuleAccessLoading) {
        return {
          ...category,
          modules: [],
        };
      }

      return {
        ...category,
        modules: category.modules.filter((module) => {
          if (isPlatformSuperAdmin) {
            return module.platformOnly === true;
          }

          if (module.platformOnly) {
            return false;
          }

          return canViewModuleFromPath(module.path);
        }),
      };
    })
    .filter(
      (category) =>
        category.modules.length > 0 ||
        (category.isModuleAccessCategory === true && isModuleAccessLoading),
    );
  const mainContent = shouldRenderModuleAccessLoading ? (
    <ModuleAccessLoadingState />
  ) : shouldRenderModuleAccessDenied ? (
    <ModuleAccessDeniedState
      fallbackHref={
        getModulePermissionLevel(moduleAccessUser, "integracao") === 0 ? "/tasks" : "/dashboard"
      }
      fallbackLabel={
        getModulePermissionLevel(moduleAccessUser, "integracao") === 0
          ? "Ir para Minhas tarefas"
          : "Voltar para o dashboard"
      }
    />
  ) : (
    children
  );

  useEffect(() => {
    if (
      isSelfProfileRoute ||
      isModuleAccessLoading ||
      getModulePermissionLevel(moduleAccessUser, "integracao") !== 0 ||
      canViewTasksOnlyRoute
    ) {
      return;
    }

    void router.replace("/tasks");
  }, [canViewTasksOnlyRoute, isModuleAccessLoading, isSelfProfileRoute, moduleAccessUser, router]);

  useEffect(() => {
    setHasUserPhotoLoadError(false);
  }, [displayUserPhoto]);

  const handleLogout = () => {
    logoutUser();
  };

  const getTimeLabel = () =>
    new Date().toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });

  const openAiChat = (trigger?: HTMLButtonElement | null) => {
    if (trigger !== undefined) {
      aiChatTriggerRef.current = trigger;
    }

    setShowAiChat(true);
  };

  const sendChatMessage = (rawText: string, trigger?: HTMLButtonElement | null) => {
    const text = rawText.trim();
    if (!text) {
      return;
    }

    const userMsg: ChatMessage = {
      id: `${Date.now()}-u`,
      sender: "user",
      text,
      time: getTimeLabel(),
    };
    const aiMsg: ChatMessage = {
      id: `${Date.now()}-a`,
      sender: "ai",
      text: "Este assistente ainda não está conectado a uma IA. A mensagem foi mantida apenas nesta sessão e não foi enviada ao servidor.",
      time: getTimeLabel(),
    };

    setChatMessages((prev) => [...prev, userMsg, aiMsg]);
    openAiChat(trigger);
  };

  const handleHeaderAiSubmit = (trigger?: HTMLButtonElement | null) => {
    sendChatMessage(aiQuery, trigger);
    setAiQuery("");
  };

  const handleChatInputSubmit = () => {
    sendChatMessage(chatInput);
    setChatInput("");
  };

  async function handleNotificationClick(item: AppShellNotification) {
    setShowNotifications(false);

    if (item.unread) {
      try {
        if (item.source === "rh") {
          await markRhNotificationReadMutation.mutateAsync({ id: item.notificationId });
        } else {
          await markNotificationRead.mutateAsync(item.notificationId);
        }
      } catch {
        toast.error(
          item.source === "rh"
            ? "Não foi possível marcar a notificação de RH como lida."
            : "Não foi possível marcar a notificação de tarefa como lida.",
        );
      }
    }

    if (item.source === "rh" && item.requestId) {
      void router.push({
        pathname: "/rh",
        query: { requestId: item.requestId },
      });
    }

    if (item.source === "task" && item.taskId) {
      void router.push({
        pathname: "/tasks",
        query: { taskId: item.taskId },
      });
    }
  }

  const openSidebarPreview = () => {
    if (!isSidebarOpen) {
      setIsSidebarPreviewOpen(true);
    }
  };

  const closeSidebarPreview = () => {
    if (!isSidebarOpen) {
      setIsSidebarPreviewOpen(false);
    }
  };

  const pinSidebarOpen = () => {
    if (!isSidebarOpen) {
      setIsSidebarOpen(true);
      setIsSidebarPreviewOpen(false);
    }
  };

  const toggleSidebar = () => {
    if (isSidebarOpen) {
      setIsSidebarOpen(false);
      setIsSidebarPreviewOpen(false);
      return;
    }

    pinSidebarOpen();
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        sidebarRef.current &&
        !sidebarRef.current.contains(event.target as Node) &&
        mobileMenuButtonRef.current &&
        !mobileMenuButtonRef.current.contains(event.target as Node)
      ) {
        if (isMobileMenuOpen) setIsMobileMenuOpen(false);
        if (isSidebarPreviewOpen) setIsSidebarPreviewOpen(false);
      }
    };

    if (isMobileMenuOpen || isSidebarPreviewOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isMobileMenuOpen, isSidebarPreviewOpen]);

  useEffect(() => {
    if (!showNotifications && !showUserMenu && !showAiChat) {
      return;
    }

    function handleAppShellOverlayKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      if (showAiChat) {
        setShowAiChat(false);
        return;
      }

      if (showUserMenu) {
        setShowUserMenu(false);
        return;
      }

      setShowNotifications(false);
    }

    document.addEventListener("keydown", handleAppShellOverlayKeyDown);

    return () => {
      document.removeEventListener("keydown", handleAppShellOverlayKeyDown);
    };
  }, [showAiChat, showNotifications, showUserMenu]);

  useEffect(() => {
    if (!showAiChat) {
      return;
    }
    chatScrollRef.current?.scrollTo({
      top: chatScrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [chatMessages, showAiChat]);

  if (isIframeView) {
    return (
      <div
        className={`min-h-screen bg-gray-50 dark:bg-slate-950 ${impersonation ? "pt-12" : ""}`}
      >
        {impersonationBanner}
        {mainContent}
      </div>
    );
  }

  return (
    <div
      className={`min-h-screen bg-gray-50 dark:bg-slate-950 ${impersonation ? "pt-12" : ""}`}
    >
      {impersonationBanner}
      <button
        ref={mobileMenuButtonRef}
        onClick={() => setIsMobileMenuOpen((v) => !v)}
        className={`lg:hidden fixed ${impersonation ? "top-14" : "top-4"} left-4 z-50 p-2 bg-white dark:bg-slate-900 rounded-lg shadow-lg`}
        type="button"
        aria-label={isMobileMenuOpen ? "Fechar menu" : "Abrir menu"}
        aria-expanded={isMobileMenuOpen}
      >
        {isMobileMenuOpen ? (
          <X className="w-6 h-6 text-gray-700 dark:text-white" />
        ) : (
          <Menu className="w-6 h-6 text-gray-700 dark:text-white" />
        )}
      </button>

      <aside
        ref={sidebarRef}
        onMouseEnter={openSidebarPreview}
        onMouseLeave={closeSidebarPreview}
        onFocus={openSidebarPreview}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            closeSidebarPreview();
          }
        }}
        onClick={pinSidebarOpen}
        className={`fixed ${impersonation ? "top-12 h-[calc(100vh-3rem)]" : "top-0 h-full"} left-0 bg-white dark:bg-slate-900 border-r border-gray-200 dark:border-slate-800 transition-all duration-300 z-40 ${
          shouldExpandSidebar ? "w-64" : "w-20"
        } ${isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"} ${isSidebarPreviewOpen ? "lg:z-50 lg:shadow-xl" : ""} lg:translate-x-0`}
      >
        <div
          className={`h-16 border-b border-gray-200 dark:border-slate-800 flex items-center ${
            shouldExpandSidebar ? "justify-between gap-2 px-4" : "justify-center px-2"
          }`}
        >
          {shouldExpandSidebar ? <Logo showText /> : null}
          <button
            onClick={(event) => {
              event.stopPropagation();
              toggleSidebar();
            }}
            className="hidden h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 transition-colors hover:bg-gray-50 dark:border-slate-800 dark:bg-slate-900 dark:text-gray-400 dark:hover:bg-slate-800 lg:inline-flex"
            type="button"
            aria-label={sidebarToggleLabel}
            title={sidebarToggleLabel}
          >
            {isSidebarOpen ? (
              <ChevronLeft className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
        </div>

        <nav className={`p-3 space-y-6 h-[calc(100vh-4rem)] ${SYSTEM_VERTICAL_SCROLL_AREA_CLASSNAME}`}>
          {filteredModuleCategories.map((category) => {
            const shouldRenderModuleNavLoading =
              category.isModuleAccessCategory === true && isModuleAccessLoading;

            return (
              <div key={category.name}>
                {shouldExpandSidebar ? (
                  <div className="px-3 mb-2">
                    <span className="text-xs font-semibold text-black dark:text-white uppercase tracking-wider">
                      {category.name}
                    </span>
                  </div>
                ) : null}

                <div className="space-y-1">
                  {shouldRenderModuleNavLoading ? (
                    <ModuleNavLoadingItem showText={shouldExpandSidebar} />
                  ) : (
                    category.modules.map((module) => {
                      const Icon = module.icon;
                      const isActive = pathname === module.path;

                      return (
                        <Link
                          key={module.path}
                          href={module.path}
                          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${
                            isActive
                              ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300"
                              : "text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800"
                          } ${!shouldExpandSidebar ? "justify-center" : ""}`}
                          title={!shouldExpandSidebar ? module.name : undefined}
                        >
                          <Icon className="w-5 h-5 flex-shrink-0" />
                          {shouldExpandSidebar ? (
                            <span className="text-sm font-medium">
                              {getNavigationModuleName(module, moduleAccessUser)}
                            </span>
                          ) : null}
                        </Link>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </nav>
      </aside>

      <div
        className={`flex flex-col min-h-screen transition-all duration-300 ${isSidebarOpen ? "lg:ml-64" : "lg:ml-20"}`}
      >
        <header
          className={`bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-800 px-6 py-3 sticky ${impersonation ? "top-12" : "top-0"} z-40`}
        >
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 max-w-2xl">
              {isPlatformSuperAdmin ? (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-700 dark:text-blue-300">
                    Ambiente isolado
                  </p>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    Administração da plataforma
                  </p>
                </div>
              ) : AI_ASSISTANT_ENABLED ? (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 dark:text-slate-400" />
                  <input
                    value={aiQuery}
                    onChange={(e) => setAiQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleHeaderAiSubmit();
                      }
                    }}
                    placeholder="Pergunte qualquer coisa ao Assistente IA..."
                    className="w-full pl-9 pr-10 py-2 rounded-xl border border-gray-200 dark:border-slate-800 bg-white/70 dark:bg-slate-800/60 text-sm text-gray-900 dark:text-slate-100 placeholder:text-gray-500 dark:placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  />
                  <button
                    onClick={(event) => {
                      if (aiQuery.trim()) {
                        handleHeaderAiSubmit(event.currentTarget);
                      } else {
                        openAiChat(event.currentTarget);
                      }
                    }}
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
                    title="Abrir Assistente IA"
                  >
                    <Bot className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  </button>
                </div>
              ) : null}
            </div>

            <div className="flex items-center gap-3">
              <div ref={notificationsRef} className="contents">
                {!isPlatformSuperAdmin ? (
                  <button
                    onClick={() => setShowNotifications((v) => !v)}
                    className="relative p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                    type="button"
                    aria-expanded={showNotifications}
                    aria-controls={NOTIFICATIONS_PANEL_ID}
                    aria-label="Abrir notificações"
                  >
                    <Bell className="w-5 h-5 text-gray-600 dark:text-slate-300" />
                    {hasUnreadNotifications ? (
                      <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
                    ) : null}
                  </button>
                ) : null}

                {!isPlatformSuperAdmin && showNotifications ? (
                  <div
                    id={NOTIFICATIONS_PANEL_ID}
                    className="absolute right-6 top-16 w-96 max-w-[calc(100vw-2rem)] bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-50"
                  >
                    <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                        Notificações
                      </h3>
                    </div>
                    <div className={`max-h-96 ${SYSTEM_VERTICAL_SCROLL_AREA_CLASSNAME}`}>
                      {isNotificationsLoading ? (
                        <div
                          role="status"
                          className="flex items-center justify-center gap-2 px-4 py-6 text-sm text-gray-500 dark:text-gray-400"
                        >
                          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                          Carregando notificações...
                        </div>
                      ) : null}
                      {hasNotificationsError ? (
                        <div
                          role="alert"
                          className="border-b border-red-100 px-4 py-4 text-sm text-red-700 dark:border-red-900/60 dark:text-red-300"
                        >
                          <p>Não foi possível carregar todas as notificações.</p>
                          <button
                            type="button"
                            onClick={() => {
                              if (notificationQuery.isError) void notificationQuery.refetch();
                              if (rhNotificationsQuery.isError) void rhNotificationsQuery.refetch();
                            }}
                            className="mt-2 font-semibold underline underline-offset-2"
                          >
                            Tentar novamente
                          </button>
                        </div>
                      ) : null}
                      {notifications.length > 0 ? (
                        notifications.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => void handleNotificationClick(item)}
                            className="w-full text-left px-4 py-3 border-b border-gray-100 dark:border-gray-700 last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-700/60 transition-colors"
                          >
                            <div className="flex items-start gap-3">
                              <span
                                className={`mt-1 h-2 w-2 rounded-full ${item.unread ? "bg-red-500" : "bg-gray-300 dark:bg-gray-600"}`}
                              />
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-gray-900 dark:text-white">
                                  {item.title}
                                </p>
                                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                                  {item.description}
                                </p>
                              </div>
                              <span className="text-[11px] text-gray-500 dark:text-gray-400 whitespace-nowrap">
                                {item.time}
                              </span>
                            </div>
                          </button>
                        ))
                      ) : !isNotificationsLoading && !hasNotificationsError ? (
                        <div className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                          Nenhuma notificação encontrada.
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>

              <div ref={userMenuRef} className="relative">
                <button
                  onClick={() => setShowUserMenu((v) => !v)}
                  className="flex items-center gap-2 px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  type="button"
                  aria-expanded={showUserMenu}
                  aria-controls={USER_MENU_PANEL_ID}
                  aria-haspopup="menu"
                >
                  <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-blue-500 to-blue-600">
                    {displayUserPhoto && !hasUserPhotoLoadError ? (
                      <img
                        src={displayUserPhoto}
                        alt={`Foto de ${displayUserName}`}
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover"
                        onError={() => setHasUserPhotoLoadError(true)}
                      />
                    ) : (
                      <span className="text-xs font-semibold text-white">
                        {displayUserInitials}
                      </span>
                    )}
                  </div>
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300 hidden md:block">
                    {displayUserName}
                  </span>
                  <ChevronDown className="w-4 h-4 text-gray-500 dark:text-slate-400" />
                </button>

                {showUserMenu ? (
                  <div
                    id={USER_MENU_PANEL_ID}
                    role="menu"
                    className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-2 z-50"
                  >
                    <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {displayUserName}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {displayUserLogin}
                      </p>
                    </div>
                    {getModulePermissionLevel(moduleAccessUser, "integracao") !== 0 ? (
                      <Link
                        href="/configuracoes"
                        className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center gap-2"
                        onClick={() => setShowUserMenu(false)}
                        role="menuitem"
                      >
                        <Settings className="w-4 h-4" />
                        Configurações
                      </Link>
                    ) : null}
                    <div className="border-t border-gray-100 dark:border-gray-700 mt-2 pt-2">
                      <button
                        onClick={handleLogout}
                        className="w-full px-4 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        type="button"
                        role="menuitem"
                      >
                        Sair
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </header>

        <main className={`flex-1 p-4 lg:p-8 ${SYSTEM_VERTICAL_SCROLL_AREA_CLASSNAME}`}>{mainContent}</main>
      </div>

      {AI_ASSISTANT_ENABLED ? (
      <DialogPrimitive.Root open={showAiChat} onOpenChange={setShowAiChat}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-black/40" />
          <DialogPrimitive.Content
            className="fixed z-[70] right-4 bottom-4 w-[420px] max-w-[calc(100vw-2rem)] h-[70vh] bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden focus:outline-none"
            onCloseAutoFocus={(event) => {
              if (!aiChatTriggerRef.current) {
                return;
              }

              event.preventDefault();
              aiChatTriggerRef.current.focus();
            }}
          >
            <div className="px-4 py-3 border-b border-gray-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                <DialogPrimitive.Title className="text-sm font-semibold text-gray-900 dark:text-white">
                  Assistente IA
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="sr-only">
                  Assistente local da sessão: as mensagens ficam apenas nesta sessão, não são
                  enviadas ao servidor e ainda não são processadas por uma IA real.
                </DialogPrimitive.Description>
              </div>
              <DialogPrimitive.Close asChild>
                <button
                  className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
                  type="button"
                  aria-label="Fechar Assistente IA"
                >
                  <X className="w-4 h-4 text-gray-500 dark:text-slate-400" />
                </button>
              </DialogPrimitive.Close>
            </div>

            <p className="border-b border-gray-200 bg-purple-50 px-4 py-2 text-xs text-purple-900 dark:border-slate-800 dark:bg-purple-950/30 dark:text-purple-100">
              Assistente local da sessão: as mensagens ficam apenas nesta sessão, não são enviadas
              ao servidor e ainda não são processadas por uma IA real.
            </p>

            <div
              ref={chatScrollRef}
              className={`flex-1 p-4 space-y-3 bg-gray-50 dark:bg-slate-950/40 ${SYSTEM_VERTICAL_SCROLL_AREA_CLASSNAME}`}
            >
              {chatMessages.length === 0 ? (
                <div className="h-full flex items-center justify-center text-center">
                  <p className="text-sm text-gray-600 dark:text-slate-400">
                    Envie uma mensagem para iniciar a conversa com a IA.
                  </p>
                </div>
              ) : (
                chatMessages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.sender === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-3 py-2 ${
                        message.sender === "user"
                          ? "bg-blue-600 text-white rounded-br-md"
                          : "bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 border border-gray-200 dark:border-slate-700 rounded-bl-md"
                      }`}
                    >
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.text}</p>
                      <p
                        className={`text-[11px] mt-1 ${
                          message.sender === "user"
                            ? "text-blue-100"
                            : "text-gray-500 dark:text-slate-400"
                        }`}
                      >
                        {message.time}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="p-3 border-t border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <div className="flex items-center gap-2">
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleChatInputSubmit();
                    }
                  }}
                  placeholder="Digite uma mensagem..."
                  className="flex-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-slate-100 placeholder:text-gray-500 dark:placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                />
                <button
                  onClick={handleChatInputSubmit}
                  className="px-3 py-2 rounded-xl bg-blue-600 text-white text-sm hover:bg-blue-700 transition-colors"
                  type="button"
                >
                  Enviar
                </button>
              </div>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
      ) : null}
    </div>
  );
}
