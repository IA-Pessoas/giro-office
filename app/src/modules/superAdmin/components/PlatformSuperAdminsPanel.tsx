import { usePlatformSuperAdmins } from "../hooks/usePlatformSuperAdmins";

export function PlatformSuperAdminsPanel() {
  const superAdminsQuery = usePlatformSuperAdmins();
  const superAdmins = superAdminsQuery.data ?? [];

  return (
    <section className="space-y-4 p-4">
      <header>
        <h2 className="text-lg font-semibold text-slate-950 dark:text-white">Super admins</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Consulta somente leitura dos administradores e da permissão de personificar.
        </p>
      </header>

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
        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
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
                      {admin.can_impersonate ? "Pode personificar" : "Não pode personificar"}
                    </span>
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
