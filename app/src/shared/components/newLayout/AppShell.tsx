import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  Bot,
  Bell,
  Briefcase,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Code,
  CreditCard,
  FileText,
  Filter,
  LayoutDashboard,
  Menu,
  Search,
  Settings,
  Shield,
  SquareCheck,
  FolderKanban,
  TrendingUp,
  Users,
  X,
} from "lucide-react";

import { useAuth } from "../../../context/AuthContext";

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
          Castelo Workspace
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
      { path: "/clients", name: "Clientes", icon: Users },
      { path: "/projects", name: "Projetos", icon: FolderKanban },
      { path: "/tasks", name: "Tarefas", icon: SquareCheck },
    ],
  },
  {
    name: "Módulos",
    modules: [
      { path: "/comercial", name: "Comercial", icon: TrendingUp },
      { path: "/marketing", name: "Marketing", icon: TrendingUp },
      { path: "/regularize", name: "Regularize", icon: TrendingUp },
      { path: "/fiscal", name: "Fiscal", icon: FileText },
      { path: "/contabil", name: "Contábil", icon: FileText },
      { path: "/rh", name: "RH", icon: Users },
      { path: "/departamento-pessoal", name: "Dep. Pessoal", icon: Users },
      { path: "/tecnologia", name: "Tecnologia", icon: Code },
      { path: "/triagem", name: "Triagem", icon: Filter },
      { path: "/parcelamento", name: "Parcelamento", icon: CreditCard },
    ],
  },
  {
    name: "Sistema",
    modules: [{ path: "/configs/integracao", name: "Configurações", icon: Settings }],
  },
  {
    name: "Admin",
    modules: [{ path: "/administracao", name: "Administração", icon: Shield }],
  },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, logoutUser } = useAuth();

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [aiQuery, setAiQuery] = useState("");

  const sidebarRef = useRef<HTMLDivElement>(null);
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);

  const pathname = router.asPath.split("?")[0] ?? "";

  const handleLogout = () => {
    logoutUser();
    router.push("/login");
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
          {moduleCategories.map((category) => (
            <div key={category.name}>
              {isSidebarOpen ? (
                <div className="px-3 mb-2">
                  <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
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
                  placeholder="Pergunte qualquer coisa ao Assistente IA..."
                  className="w-full pl-9 pr-10 py-2 rounded-xl border border-gray-200 dark:border-slate-800 bg-white/70 dark:bg-slate-800/60 text-sm text-gray-900 dark:text-slate-100 placeholder:text-gray-500 dark:placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                />
                <button
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
                className="relative p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                type="button"
              >
                <Bell className="w-5 h-5 text-gray-600 dark:text-slate-300" />
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
              </button>

              <Link
                href="/configs/integracao"
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <Settings className="w-5 h-5 text-gray-600 dark:text-slate-300" />
              </Link>

              <div className="relative">
                <button
                  onClick={() => setShowUserMenu((v) => !v)}
                  className="flex items-center gap-2 px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  type="button"
                >
                  <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center">
                    <span className="text-xs font-semibold text-white">
                      {user?.name?.slice(0, 2)?.toUpperCase() ?? "AD"}
                    </span>
                  </div>
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300 hidden md:block">
                    {user?.name ?? "Admin"}
                  </span>
                  <ChevronDown className="w-4 h-4 text-gray-500 dark:text-slate-400" />
                </button>

                {showUserMenu ? (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
                    <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-2 z-50">
                      <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {user?.name ?? "Admin"}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{user?.email ?? ""}</p>
                      </div>
                      <Link
                        href="/configs/integracao"
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

        <main className="flex-1 overflow-y-auto p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}

