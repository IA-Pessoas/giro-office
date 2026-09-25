import { useAuth } from "@/context/AuthContext";
import { isAxiosError } from "axios";
import { SYSTEM_HORIZONTAL_SCROLL_AREA_CLASSNAME } from "@shared/ui/newLayout/scrollbar";

import {
  usePlatformSuperAdmins,
  useUpdatePlatformSuperAdminImpersonationPermission,
} from "../hooks/usePlatformSuperAdmins";
import { formatImpersonationPermission } from "../utils/platformManagement";

export function PlatformSuperAdminsPanel() {
  const { user: currentUser } = useAuth();
  const superAdminsQuery = usePlatformSuperAdmins();
  const permissionMutation = useUpdatePlatformSuperAdminImpersonationPermission();
  const superAdmins = superAdminsQuery.data ?? [];
  const canManagePermissions =
    currentUser?.auth_kind === "platform" &&
    currentUser.platform_role === "super_admin" &&
    currentUser.can_impersonate === true;

  return (
    <section className="space-y-4 p-4">
      <header>
        <h2 className="text-lg font-semibold text-slate-950 dark:text-white">Super admins</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Consulte os administradores e conceda ou revogue a permissão de personificar.
        </p>
      </header>

      {!canManagePermissions ? (
        <p className="text-sm text-slate-600 dark:text-slate-300" role="status">
          Sua conta não tem permissão para alterar a personificação.
        </p>
      ) : null}
      {permissionMutation.isError ? (
        <p className="text-sm text-rose-700 dark:text-rose-300" role="alert">
          {(isAxiosError(permissionMutation.error)
            ? permissionMutation.error.response?.data?.error
            : undefined) ?? "Não foi possível atualizar a permissão de personificação."}
        </p>
      ) : null}
      {permissionMutation.isSuccess ? (
        <p className="text-sm text-emerald-700 dark:text-emerald-300" role="status">
          Permissão de personificação atualizada.
        </p>
      ) : null}

      {superAdminsQuery.isLoading ? (
        <p className="text-sm text-slate-600 dark:text-slate-300" role="status">
          Carregando super admins...
        </p>
      ) : superAdminsQuery.isError ? (
        <div
          className="rounded-lg bg-rose-50 p-4 text-sm text-rose-900 dark:bg-rose-950/30 dark:text-rose-100"
          role="alert"
        >
          <p>Não foi possível carregar os super admins.</p>
          <button
            className="mt-3 font-semibold underline underline-offset-4"
            onClick={() => void superAdminsQuery.refetch()}
            type="button"
          >
            Tentar novamente
          </button>
        </div>
      ) : superAdmins.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 p-5 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300">
          Nenhum super admin cadastrado.
        </p>
      ) : (
        <div
          className={`rounded-lg border border-slate-200 dark:border-slate-800 ${SYSTEM_HORIZONTAL_SCROLL_AREA_CLASSNAME} contain-layout`}
        >
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm dark:divide-slate-800">
            <caption className="sr-only">Lista de super admins da plataforma</caption>
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-950 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3 font-semibold" scope="col">
                  Nome
                </th>
                <th className="px-4 py-3 font-semibold" scope="col">
                  E-mail
                </th>
                <th className="px-4 py-3 font-semibold" scope="col">
                  Status
                </th>
                <th className="px-4 py-3 font-semibold" scope="col">
                  Personificação
                </th>
                <th className="px-4 py-3 font-semibold" scope="col">
                  Alterar permissão
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {superAdmins.map((admin) => (
                <tr key={admin.id}>
                  <th
                    className="whitespace-nowrap px-4 py-3 font-medium text-slate-950 dark:text-white"
                    scope="row"
                  >
                    {admin.name}
                  </th>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-700 dark:text-slate-200">
                    {admin.email}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                      {admin.status === "active" ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        admin.can_impersonate
                          ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
                          : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                      }`}
                    >
                      {formatImpersonationPermission(admin.can_impersonate)}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        aria-checked={admin.can_impersonate}
                        aria-describedby={
                          !canManagePermissions || admin.id === currentUser?.id
                            ? `platform-super-admin-permission-reason-${admin.id}`
                            : undefined
                        }
                        aria-label={`${admin.can_impersonate ? "Revogar" : "Conceder"} permissão de personificação para ${admin.name}`}
                        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50 ${admin.can_impersonate ? "bg-emerald-600" : "bg-slate-300 dark:bg-slate-700"}`}
                        disabled={
                          !canManagePermissions ||
                          admin.id === currentUser?.id ||
                          permissionMutation.isPending
                        }
                        onClick={() =>
                          permissionMutation.mutate({
                            superAdminId: admin.id,
                            canImpersonate: !admin.can_impersonate,
                          })
                        }
                        role="switch"
                        type="button"
                      >
                        <span
                          aria-hidden="true"
                          className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${admin.can_impersonate ? "translate-x-6" : "translate-x-1"}`}
                        />
                      </button>
                      {admin.id === currentUser?.id ? (
                        <span className="text-xs text-slate-500 dark:text-slate-400">Sua conta</span>
                      ) : null}
                      {!canManagePermissions || admin.id === currentUser?.id ? (
                        <span
                          className="sr-only"
                          id={`platform-super-admin-permission-reason-${admin.id}`}
                        >
                          {admin.id === currentUser?.id
                            ? "Você não pode alterar sua própria permissão."
                            : "Sua conta não tem permissão para alterar a personificação."}
                        </span>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
