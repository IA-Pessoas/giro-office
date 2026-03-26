import { useEffect, useState } from "react";
import { Bell, Globe, Moon, Palette, Shield, Sun, User } from "lucide-react";

export function FigmaConfiguracoes() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggleTheme = () => {
    if (typeof window === "undefined") {
      return;
    }
    const next = !isDark;
    document.documentElement.classList.toggle("dark", next);
    setIsDark(next);
  };

  const user = {
    name: "Admin Workspace",
    email: "admin@workspace.com",
    initials: "AW",
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Configurações</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          Gerencie suas preferências e configurações do sistema
        </p>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center gap-3 mb-6">
          <User className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Perfil do Usuário</h2>
        </div>

        <div className="flex items-center gap-4 mb-4">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center">
            <span className="text-xl font-semibold text-white">{user.initials}</span>
          </div>
          <div>
            <p className="text-lg font-medium text-gray-900 dark:text-white">{user.name}</p>
            <p className="text-sm text-gray-600 dark:text-gray-400">{user.email}</p>
          </div>
        </div>

        <button
          className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          type="button"
        >
          Editar Perfil
        </button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center gap-3 mb-6">
          <Palette className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Aparência</h2>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
            <div className="flex items-center gap-3">
              {isDark ? (
                <Moon className="w-5 h-5 text-blue-600" />
              ) : (
                <Sun className="w-5 h-5 text-yellow-500" />
              )}
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Modo Escuro</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {isDark ? "Ativado" : "Desativado"}
                </p>
              </div>
            </div>
            <button
              onClick={toggleTheme}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                isDark ? "bg-blue-600" : "bg-gray-300"
              }`}
              type="button"
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  isDark ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center gap-3 mb-6">
          <Bell className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Notificações</h2>
        </div>

        <div className="space-y-3">
          <label className="flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg cursor-pointer">
            <span className="text-sm text-gray-700 dark:text-gray-300">Notificações por email</span>
            <input type="checkbox" defaultChecked className="w-4 h-4 text-blue-600 rounded" />
          </label>
          <label className="flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg cursor-pointer">
            <span className="text-sm text-gray-700 dark:text-gray-300">Notificações de tarefas</span>
            <input type="checkbox" defaultChecked className="w-4 h-4 text-blue-600 rounded" />
          </label>
          <label className="flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg cursor-pointer">
            <span className="text-sm text-gray-700 dark:text-gray-300">Alertas de prazos</span>
            <input type="checkbox" defaultChecked className="w-4 h-4 text-blue-600 rounded" />
          </label>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center gap-3 mb-6">
          <Globe className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Preferências</h2>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Idioma</label>
            <select className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option>Português (BR)</option>
              <option>English (US)</option>
              <option>Español</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Fuso Horário
            </label>
            <select className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option>América/São Paulo (GMT-3)</option>
              <option>América/Rio de Janeiro (GMT-3)</option>
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center gap-3 mb-6">
          <Shield className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Segurança</h2>
        </div>

        <div className="space-y-3">
          <button
            className="w-full text-left px-4 py-3 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            type="button"
          >
            <p className="font-medium text-gray-900 dark:text-white">Alterar senha</p>
            <p className="text-sm text-gray-600 dark:text-gray-400">Última alteração há 45 dias</p>
          </button>
          <button
            className="w-full text-left px-4 py-3 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            type="button"
          >
            <p className="font-medium text-gray-900 dark:text-white">Autenticação de dois fatores</p>
            <p className="text-sm text-gray-600 dark:text-gray-400">Desativada</p>
          </button>
        </div>
      </div>
    </div>
  );
}

