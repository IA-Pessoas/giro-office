import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import { Building2, Plus, Search } from "lucide-react";

import { CreateDepModal, departmentService, type DepItem } from "@modules/departments";
import { getDepartmentColorLabel } from "@modules/departments/utils/colors";
import { useFetch } from "@shared/hooks";

const DEPARTMENTS_GRADIENT_ICON_CLASSNAME =
  "bg-gradient-to-br from-[var(--colors-brand-gradient-start)] to-[var(--colors-brand-gradient-end)] shadow-lg shadow-blue-950/20";

const DEPARTMENTS_GRADIENT_BUTTON_CLASSNAME =
  "bg-gradient-to-r from-[var(--colors-brand-gradient-start)] to-[var(--colors-brand-gradient-end)] shadow-lg shadow-blue-950/20 transition-all hover:from-[var(--colors-brand-gradient-hover-start)] hover:to-[var(--colors-brand-gradient-hover-end)]";

const DEPARTMENTS_PANEL_CLASSNAME =
  "rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900";

const DEPARTMENTS_SUBPANEL_CLASSNAME =
  "rounded-2xl border border-slate-200 bg-slate-50/70 dark:border-slate-700 dark:bg-slate-950/40";

const DEPARTMENTS_INPUT_CLASSNAME =
  "w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-900 shadow-sm outline-none transition-all placeholder:text-slate-400 focus:border-[var(--colors-brand-gradient-end)] focus:ring-2 focus:ring-[var(--colors-brand-gradient-start)]/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500";

const DEPARTMENTS_SELECT_ARROW_STYLE = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none'%3E%3Cpath d='m5 7.5 5 5 5-5' stroke='%2394a3b8' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
} as const;

const statusClassNameByValue: Record<string, string> = {
  Ativo: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  Inativo: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function getStatusFilterValue(status: string): { status?: string } | undefined {
  if (status === "Ativo" || status === "Inativo") {
    return { status };
  }

  return undefined;
}

export function Departments() {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("Todos");
  const deferredSearch = useDeferredValue(search);

  const departmentsQuery = useFetch<DepItem[]>(
    ["departments", status],
    () => departmentService.list(getStatusFilterValue(status)),
    {
      retry: false,
    },
  );

  const departments = departmentsQuery.data ?? [];

  const filteredDepartments = useMemo(() => {
    const normalizedSearch = normalizeSearchText(deferredSearch);

    if (!normalizedSearch) {
      return departments;
    }

    return departments.filter((department) =>
      normalizeSearchText(department.name).includes(normalizedSearch),
    );
  }, [deferredSearch, departments]);

  return (
    <div className="space-y-6">
      <CreateDepModal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="mb-1 flex items-center gap-3 text-3xl font-bold text-slate-900 dark:text-white">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-xl ${DEPARTMENTS_GRADIENT_ICON_CLASSNAME}`}
            >
              <Building2 className="h-6 w-6 text-white" />
            </div>
            Departamentos
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Gerencie a estrutura de departamentos da organização.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsCreateModalOpen(true)}
          className={`inline-flex w-fit items-center gap-2 rounded-xl px-4 py-2.5 text-white ${DEPARTMENTS_GRADIENT_BUTTON_CLASSNAME}`}
        >
          <Plus className="h-5 w-5" />
          Novo departamento
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px_180px]">
        <div className={`${DEPARTMENTS_SUBPANEL_CLASSNAME} p-4`}>
          <label className="space-y-2">
            <span className="block text-sm font-medium text-slate-700 dark:text-white">
              Busca
            </span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por nome do departamento"
                className={DEPARTMENTS_INPUT_CLASSNAME}
              />
            </div>
          </label>
        </div>

        <div className={`${DEPARTMENTS_SUBPANEL_CLASSNAME} p-4`}>
          <label className="space-y-2">
            <span className="block text-sm font-medium text-slate-700 dark:text-white">
              Status
            </span>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="w-full appearance-none rounded-xl border border-slate-200 bg-white bg-[length:14px] bg-[position:right_1.25rem_center] bg-no-repeat px-3 py-2.5 pr-14 text-sm text-slate-900 shadow-sm outline-none transition-all focus:border-[var(--colors-brand-gradient-end)] focus:ring-2 focus:ring-[var(--colors-brand-gradient-start)]/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              style={DEPARTMENTS_SELECT_ARROW_STYLE}
            >
              <option value="Todos">Todos</option>
              <option value="Ativo">Ativo</option>
              <option value="Inativo">Inativo</option>
            </select>
          </label>
        </div>

        <div className={`${DEPARTMENTS_SUBPANEL_CLASSNAME} flex flex-col justify-center p-4`}>
          <span className="text-sm text-slate-500 dark:text-slate-400">Total encontrado</span>
          <strong className="text-2xl font-semibold text-slate-900 dark:text-white">
            {filteredDepartments.length}
          </strong>
        </div>
      </div>

      <section className={`${DEPARTMENTS_PANEL_CLASSNAME} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="border-b border-slate-200 bg-slate-50/80 dark:border-slate-700 dark:bg-slate-950/40">
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <th className="px-6 py-4 font-medium">Departamento</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium">Cor</th>
                <th className="px-6 py-4 font-medium text-center">Ação</th>
              </tr>
            </thead>
            <tbody>
              {departmentsQuery.isLoading ? (
                <tr>
                  <td className="px-6 py-10 text-sm text-slate-500 dark:text-slate-400" colSpan={4}>
                    Carregando departamentos...
                  </td>
                </tr>
              ) : departmentsQuery.isError ? (
                <tr>
                  <td className="px-6 py-10 text-sm text-rose-600 dark:text-rose-300" colSpan={4}>
                    Não foi possível carregar a listagem no momento.
                  </td>
                </tr>
              ) : filteredDepartments.length === 0 ? (
                <tr>
                  <td className="px-6 py-10 text-sm text-slate-500 dark:text-slate-400" colSpan={4}>
                    Nenhum departamento encontrado para os filtros atuais.
                  </td>
                </tr>
              ) : (
                filteredDepartments.map((department) => (
                  <tr
                    key={department.id}
                    className="border-b border-slate-200/80 last:border-b-0 dark:border-slate-800"
                  >
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-medium text-slate-900 dark:text-white">{department.name}</p>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          ID {department.id.slice(0, 8)}
                        </p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                          statusClassNameByValue[department.status] ?? statusClassNameByValue.Inativo
                        }`}
                      >
                        {department.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <span
                          className="h-4 w-4 rounded-full border border-slate-200 shadow-sm dark:border-slate-600"
                          style={{ backgroundColor: department.color }}
                        />
                        <span className="text-sm text-slate-600 dark:text-slate-300">
                          {getDepartmentColorLabel(department.color)}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <Link
                        href={`/departments/${department.id}`}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        Editar
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
