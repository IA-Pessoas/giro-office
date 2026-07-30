import { useState, useEffect } from "react";
import Head from "next/head";
import { User } from "lucide-react";

import { useAuth } from "../../context/AuthContext";
import { canCreateUsers } from "@modules/auth";
import { useMe, useUpdateCurrentUser } from "@shared/hooks";
import { buildSelfProfileUpdatePayload } from "@shared/utils/meProfileUpdate";

const inputClass =
  "w-full mt-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30";

const labelClass = "block text-sm font-medium text-gray-700 dark:text-gray-300";

export default function Me() {
  const { user, logoutUser } = useAuth();
  const profileQuery = useMe();
  const updateUserMutation = useUpdateCurrentUser();

  const [name, setName] = useState("");
  const [login, setLogin] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const canManageUsers = canCreateUsers(user);
  const updatePayload = buildSelfProfileUpdatePayload({
    canManageUsers,
    currentName: profileQuery.data?.name ?? "",
    name,
    password: newPassword,
  });

  useEffect(() => {
    if (profileQuery.data) {
      setName(profileQuery.data.name);
      setLogin(profileQuery.data.login);
    }
  }, [profileQuery.data]);

  async function handleLogout() {
    await logoutUser();
  }

  function handleUpdate() {
    if (!updatePayload) {
      return;
    }

    updateUserMutation.mutate(updatePayload, {
      onSuccess: () => setNewPassword(""),
    });
  }

  return (
    <>
      <Head>
        <title>Meu Perfil - Office</title>
      </Head>
      <div className="space-y-6 max-w-4xl">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Meu perfil</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Visualize o login, atualize seu nome e defina uma nova senha
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center gap-3 mb-6">
            <User className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Dados da conta</h2>
          </div>

          <div className="space-y-4 max-w-xl">
            {profileQuery.isLoading ? (
              <p className="text-sm text-gray-600 dark:text-gray-400">Carregando perfil…</p>
            ) : profileQuery.isError ? (
              <p className="text-sm text-red-600 dark:text-red-400">
                Não foi possível carregar o perfil.
              </p>
            ) : null}
            {updateUserMutation.isError ? (
              <p className="text-sm text-red-600 dark:text-red-400">
                Não foi possível salvar. Tente novamente.
              </p>
            ) : null}

            <div>
              <label className={labelClass} htmlFor="me-login">
                Login
              </label>
              <input
                id="me-login"
                className={`${inputClass} opacity-70 cursor-not-allowed bg-gray-50 dark:bg-gray-900/60`}
                placeholder="Seu login"
                type="text"
                disabled
                value={login}
              />
            </div>

            <div>
              <label className={labelClass} htmlFor="me-name">
                Nome
              </label>
              <input
                id="me-name"
                className={inputClass}
                placeholder="Digite seu nome"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!canManageUsers || updateUserMutation.isPending}
              />
            </div>

            <div>
              <label className={labelClass} htmlFor="me-new-password">
                Nova Senha
              </label>
              <input
                id="me-new-password"
                className={inputClass}
                placeholder="Digite a nova senha"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                type="button"
                className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:pointer-events-none"
                onClick={handleUpdate}
                disabled={updateUserMutation.isPending || !updatePayload}
              >
                {updateUserMutation.isPending ? "Salvando…" : "Salvar alterações"}
              </button>
              <button
                type="button"
                className="px-4 py-2 text-sm font-medium rounded-lg border-2 border-red-500 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                onClick={handleLogout}
              >
                Sair da conta
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
