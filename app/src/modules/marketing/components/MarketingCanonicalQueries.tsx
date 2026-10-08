import Link from "next/link";
import { BarChart3, Building2, ContactRound, UsersRound } from "lucide-react";

import { useModuleAccessMap } from "@modules/auth/hooks/useModuleAccess";
import { canAccessAdministration } from "@modules/auth/utils/permissions";

const cardClassName =
  "group rounded-xl border border-gray-200 bg-white p-4 transition-colors hover:border-blue-300 hover:bg-blue-50/40 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-blue-700 dark:hover:bg-blue-950/20";

export function MarketingCanonicalQueries() {
  const { accessMap, departmentModule, user } = useModuleAccessMap();
  const canManageAdministration = canAccessAdministration(user, {
    rhAccess: accessMap.rh,
    departmentModule,
  });
  const links = [
    ...(accessMap.integracao.canView
      ? [{ href: "/clients", label: "Clientes", detail: "Consultar o cadastro canônico.", Icon: ContactRound }]
      : []),
    ...(canManageAdministration
      ? [{ href: "/users", label: "Colaboradores", detail: "Consultar usuários do Office.", Icon: UsersRound }]
      : []),
    ...(canManageAdministration
      ? [{ href: "/departments", label: "Departamentos", detail: "Consultar e administrar cores.", Icon: Building2 }]
      : []),
    { href: "/relatorios", label: "Relatórios", detail: "Criar e exportar relatórios permitidos.", Icon: BarChart3 },
  ];

  return (
    <section
      aria-labelledby="marketing-canonical-queries-title"
      className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800"
    >
      <div className="mb-4">
        <h2 id="marketing-canonical-queries-title" className="text-lg font-semibold text-gray-900 dark:text-white">
          Consultas e relatórios do Office
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
          Abra os cadastros oficiais e os relatórios autorizados. O Marketing não mantém cópias desses dados.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {links.map(({ href, label, detail, Icon }) => (
          <Link key={href} href={href} className={cardClassName}>
            <div className="flex items-center gap-2 text-gray-900 dark:text-white">
              <Icon className="h-4 w-4 text-blue-600 dark:text-blue-300" aria-hidden="true" />
              <span className="text-sm font-semibold">{label}</span>
            </div>
            <p className="mt-2 text-xs leading-5 text-gray-500 dark:text-slate-400">{detail}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
