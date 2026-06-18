import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  BadgeDollarSign,
  Bot,
  Bell,
  Building2,
  BriefcaseBusiness,
  Calculator,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Code,
  FileText,
  Filter,
  FileCheck,
  LayoutDashboard,
  Megaphone,
  Menu,
  Receipt,
  Search,
  Settings,
  Shield,
  ShieldCheck,
  SquareCheck,
  ContactRound,
  FolderKanban,
  UserRoundCog,
  Users,
  X,
} from "lucide-react";

import {
  APP_ROUTE_MODULE_MAP,
  MODULE_KEYS,
  canAccessAdministration,
  useModuleAccessMap,
  type ModuleKey,
} from "@modules/auth";
import { useMe } from "@shared/hooks";
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
        <path
          d="M16 4L26 10L16 16L16 28L26 22V10L16 4Z"
          fill="#60a5fa"
          opacity="0.7"
        />
        <path
          d="M16 4L6 10L16 16L16 28L6 22V10L16 4Z"
          fill="#2563eb"
          opacity="0.5"
        />
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

const moduleCategories = [
  {
    name: "Principal",
    modules: [
      { path: "/dashboard", name: "Dashboard", icon: LayoutDashboard },
      { path: "/clients", name: "Clientes", icon: ContactRound },
      { path: "/projects", name: "Projetos", icon: FolderKanban },
      { path: "/tasks", name: "Tarefas", icon: SquareCheck },
      { path: "/departments", name: "Departamentos", icon: Building2 },
    ],
  },
  {
    name: "Módulos",
    modules: [
      { path: "/comercial", name: "Comercial", icon: BriefcaseBusiness, moduleKey: "comercial" as ModuleKey },
      { path: "/certificados", name: "Certificados", icon: FileCheck, moduleKey: "certificado" as ModuleKey },
      { path: "/marketing", name: "Marketing", icon: Megaphone, moduleKey: "marketing" as ModuleKey },
      { path: "/regularize", name: "Regularize", icon: ShieldCheck, moduleKey: "regularize" as ModuleKey },
      { path: "/fiscal", name: "Fiscal", icon: Receipt, moduleKey: "fiscal" as ModuleKey },
      { path: "/contabil", name: "Contábil", icon: Calculator },
      { path: "/rh", name: "RH", icon: Users, moduleKey: "rh" as ModuleKey },
      { path: "/departamento-pessoal", name: "Dep. Pessoal", icon: UserRoundCog, moduleKey: "pessoal" as ModuleKey },
      { path: "/tecnologia", name: "Tecnologia", icon: Code, moduleKey: "ti" as ModuleKey },
      { path: "/triagem", name: "Triagem", icon: Filter, moduleKey: "triagem" as ModuleKey },
      { path: "/parcelamento", name: "Parcelamento", icon: BadgeDollarSign, moduleKey: "parcelamento" as ModuleKey },
    ],
  },
  {
    name: "Sistema",
    modules: [{ path: "/configuracoes", name: "Configurações", icon: Settings }],
  },
  {
    name: "Admin",
    modules: [{ path: "/administracao", name: "Administração", icon: Shield }],
  },
];

const MODULE_ACCESS_DENIED_MESSAGE = "Você não tem acesso a este módulo no perfil atual.";

function normalizeRoutePath(routePath: string): string {
  const pathWithoutQuery = routePath.split("?")[0]?.split("#")[0] ?? "";
  const normalizedPath =
    pathWithoutQuery.length > 1 ? pathWithoutQuery.replace(/\/+$/, "") : pathWithoutQuery;

  return normalizedPath || "/";
}

function getModuleKeyFromRoutePath(routePath: string): ModuleKey | null {
  const normalizedPath = normalizeRoutePath(routePath);
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

function ModuleAccessDeniedState() {
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
          href="/dashboard"
          className="mt-6 inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          Voltar para o dashboard
        </Link>
      </div>
    </section>
  );
}

type ChatMessage = {
  id: string;
  sender: "user" | "ai";
  text: string;
  time: string;
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, logoutUser } = useAuth();
  const meQuery = useMe();
  const { accessMap: moduleAccessMap, isLoading: isModuleAccessLoading } =
    useModuleAccessMap(MODULE_KEYS);

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showAiChat, setShowAiChat] = useState(false);
  const [aiQuery, setAiQuery] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [hasUserPhotoLoadError, setHasUserPhotoLoadError] = useState(false);
  const notifications = [
    {
      id: "1",
      title: "Novo chamado crítico aberto",
      description: "TI • Computador não liga (Financeiro)",
      time: "há 5 min",
      unread: true,
    },
    {
      id: "2",
      title: "Prazo de tarefa próximo do vencimento",
      description: "Marketing • Aprovar orçamento de campanha",
      time: "há 20 min",
      unread: true,
    },
    {
      id: "3",
      title: "Backup diário finalizado",
      description: "Tecnologia • Execução concluída com sucesso",
      time: "há 1 h",
      unread: false,
    },
  ];


  const sidebarRef = useRef<HTMLDivElement>(null);
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  const pathname = router.asPath.split("?")[0] ?? "";
  const displayUserName = user?.name ?? meQuery.data?.name ?? "Admin";
  const displayUserLogin = user?.email ?? user?.login ?? meQuery.data?.login ?? "";
  const displayUserPhoto = resolvePhotoUrl(meQuery.data?.photo_url ?? null);
  const displayUserInitials = getInitials(displayUserName);
  const isAdmin = canAccessAdministration(meQuery.data?.permission ?? user?.permission ?? null);
  const currentModuleKey = getModuleKeyFromRoutePath(pathname);
  const currentModuleAccess = currentModuleKey ? moduleAccessMap[currentModuleKey] : null;
  const shouldRenderModuleAccessDenied =
    Boolean(currentModuleKey) &&
    !isModuleAccessLoading &&
    currentModuleAccess?.canView === false;

  const canViewModuleFromPath = (modulePath: string): boolean => {
    if (modulePath === "/departments" || modulePath === "/administracao") {
      return isAdmin;
    }

    const moduleKey = getModuleKeyFromRoutePath(modulePath);

    if (!moduleKey) {
      return true;
    }

    if (isModuleAccessLoading) {
      return false;
    }

    const moduleAccess = moduleAccessMap[moduleKey];
    return Boolean(moduleAccess?.canView);
  };

  const filteredModuleCategories = moduleCategories
    .map((category) => ({
      ...category,
      modules: category.modules.filter((module) => {
        const moduleKey =
          ("moduleKey" in module ? module.moduleKey : undefined) ?? APP_ROUTE_MODULE_MAP[module.path];
        if (!moduleKey) {
          return canViewModuleFromPath(module.path);
        }

        const moduleAccess = moduleAccessMap[moduleKey];
        if (isModuleAccessLoading) {
          return false;
        }

        return moduleAccess?.canView ?? false;
      }),
    }))
    .filter((category) => category.modules.length > 0);

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

  const sendChatMessage = (rawText: string) => {
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
      text: "Recebi sua mensagem. Em breve vou responder por aqui.",
      time: getTimeLabel(),
    };

    setChatMessages((prev) => [...prev, userMsg, aiMsg]);
    setShowAiChat(true);
  };

  const handleHeaderAiSubmit = () => {
    sendChatMessage(aiQuery);
    setAiQuery("");
  };

  const handleChatInputSubmit = () => {
    sendChatMessage(chatInput);
    setChatInput("");
  };

  const toggleSidebar = () => setIsSidebarOpen((v) => !v);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        sidebarRef.current &&
        !sidebarRef.current.contains(event.target as Node) &&
        mobileMenuButtonRef.current &&
        !mobileMenuButtonRef.current.contains(event.target as Node)
      ) {
        if (isMobileMenuOpen) setIsMobileMenuOpen(false);
      }
    };

    if (isMobileMenuOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isMobileMenuOpen]);

  useEffect(() => {
    if (!showAiChat) {
      return;
    }
    chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: "smooth" });
  }, [chatMessages, showAiChat]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950">
      <button
        ref={mobileMenuButtonRef}
        onClick={() => setIsMobileMenuOpen((v) => !v)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-white dark:bg-slate-900 rounded-lg shadow-lg"
        type="button"
      >
        {isMobileMenuOpen ? (
          <X className="w-6 h-6 text-gray-700 dark:text-white" />
        ) : (
          <Menu className="w-6 h-6 text-gray-700 dark:text-white" />
        )}
      </button>

      <aside
        ref={sidebarRef}
        className={`fixed top-0 left-0 h-full bg-white dark:bg-slate-900 border-r border-gray-200 dark:border-slate-800 transition-all duration-300 z-40 ${
          isSidebarOpen ? "w-64" : "w-20"
        } ${isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0`}
      >
        <div className="h-16 border-b border-gray-200 dark:border-slate-800 flex items-center justify-between px-4">
          <Logo showText={isSidebarOpen} />
        </div>

        <button
          onClick={toggleSidebar}
          className="hidden lg:flex absolute -right-3 top-20 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-full p-1 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors z-50"
          type="button"
        >
          {isSidebarOpen ? (
            <ChevronLeft className="w-4 h-4 text-gray-600 dark:text-gray-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-600 dark:text-gray-400" />
          )}
        </button>

        <nav className="p-3 space-y-6 overflow-y-auto h-[calc(100vh-4rem)]">
          {filteredModuleCategories.map((category) => (
            <div key={category.name}>
              {isSidebarOpen ? (
                <div className="px-3 mb-2">
                  <span className="text-xs font-semibold text-black dark:text-white uppercase tracking-wider">
                    {category.name}
                  </span>
                </div>
              ) : null}

              <div className="space-y-1">
                {category.modules.map((module) => {
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
                      } ${!isSidebarOpen ? "justify-center" : ""}`}
                      title={!isSidebarOpen ? module.name : undefined}
                    >
                      <Icon className="w-5 h-5 flex-shrink-0" />
                      {isSidebarOpen ? (
                        <span className="text-sm font-medium">{module.name}</span>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      <div className={`flex flex-col min-h-screen transition-all duration-300 ${isSidebarOpen ? "lg:ml-64" : "lg:ml-20"}`}>
        <header className="bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-800 px-6 py-3 sticky top-0 z-40">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 max-w-2xl">
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
                  onClick={() => {
                    if (aiQuery.trim()) {
                      handleHeaderAiSubmit();
                    } else {
                      setShowAiChat(true);
                    }
                  }}
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
                  title="Abrir Assistente IA"
                >
                  <Bot className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowNotifications((v) => !v)}
                className="relative p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                type="button"
              >
                <Bell className="w-5 h-5 text-gray-600 dark:text-slate-300" />
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
              </button>

              {showNotifications ? (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowNotifications(false)} />
                  <div className="absolute right-6 top-16 w-96 max-w-[calc(100vw-2rem)] bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-50">
                    <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Notificações</h3>
                      <button
                        type="button"
                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        Marcar todas como lidas
                      </button>
                    </div>
                    <div className="max-h-96 overflow-y-auto">
                      {notifications.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className="w-full text-left px-4 py-3 border-b border-gray-100 dark:border-gray-700 last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-700/60 transition-colors"
                        >
                          <div className="flex items-start gap-3">
                            <span
                              className={`mt-1 h-2 w-2 rounded-full ${item.unread ? "bg-red-500" : "bg-gray-300 dark:bg-gray-600"}`}
                            />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-gray-900 dark:text-white">{item.title}</p>
                              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{item.description}</p>
                            </div>
                            <span className="text-[11px] text-gray-500 dark:text-gray-400 whitespace-nowrap">
                              {item.time}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              ) : null}

              <div className="relative">
                <button
                  onClick={() => setShowUserMenu((v) => !v)}
                  className="flex items-center gap-2 px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  type="button"
                >
                  <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-blue-500 to-blue-600">
                    {displayUserPhoto && !hasUserPhotoLoadError ? (
                      <img
                        src={displayUserPhoto}
                        alt={`Foto de ${displayUserName}`}
                        className="h-full w-full object-cover"
                        onError={() => setHasUserPhotoLoadError(true)}
                      />
                    ) : (
                      <span className="text-xs font-semibold text-white">{displayUserInitials}</span>
                    )}
                  </div>
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300 hidden md:block">
                    {displayUserName}
                  </span>
                  <ChevronDown className="w-4 h-4 text-gray-500 dark:text-slate-400" />
                </button>

                {showUserMenu ? (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
                    <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-2 z-50">
                      <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {displayUserName}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{displayUserLogin}</p>
                      </div>
                      <Link
                        href="/configuracoes"
                        className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center gap-2"
                        onClick={() => setShowUserMenu(false)}
                      >
                        <Settings className="w-4 h-4" />
                        Configurações
                      </Link>
                      <div className="border-t border-gray-100 dark:border-gray-700 mt-2 pt-2">
                        <button
                          onClick={handleLogout}
                          className="w-full px-4 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                          type="button"
                        >
                          Sair
                        </button>
                      </div>
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-8">
          {shouldRenderModuleAccessDenied ? <ModuleAccessDeniedState /> : children}
        </main>
      </div>

      {showAiChat ? (
        <>
          <div className="fixed inset-0 z-[60] bg-black/40" onClick={() => setShowAiChat(false)} />
          <div className="fixed z-[70] right-4 bottom-4 w-[420px] max-w-[calc(100vw-2rem)] h-[70vh] bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Assistente IA</h3>
              </div>
              <button
                onClick={() => setShowAiChat(false)}
                className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
                type="button"
              >
                <X className="w-4 h-4 text-gray-500 dark:text-slate-400" />
              </button>
            </div>

            <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50 dark:bg-slate-950/40">
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
                          message.sender === "user" ? "text-blue-100" : "text-gray-500 dark:text-slate-400"
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
          </div>
        </>
      ) : null}
    </div>
  );
}
