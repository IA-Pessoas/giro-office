import { useMutation, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Save } from "lucide-react";
import { useState } from "react";

import { useModuleAccess } from "@modules/auth";
import { departmentService, type DepItem } from "@modules/departments";
import { DepartmentColorField } from "@modules/departments/components/DepartmentColorField";
import { useFetch } from "@shared/hooks";

import { marketingQueryKey } from "../utils/marketingQueryKeys";
import { marketingPrimaryButtonClass, marketingSecondaryButtonClass } from "./marketingButtonStyles";

const DEPARTMENTS_QUERY_ROOT = ["marketing", "departments"] as const;

function MarketingDepartmentRow({ department, canEdit }: { department: DepItem; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const [color, setColor] = useState(department.color);
  const updateMutation = useMutation({
    mutationFn: (nextColor: string) => departmentService.update(department.id, { color: nextColor }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: DEPARTMENTS_QUERY_ROOT });
    },
  });

  return (
    <li className="grid gap-3 rounded-lg border border-gray-100 p-4 dark:border-slate-700 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-gray-900 dark:text-white">{department.name}</p>
        <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">{department.status}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {canEdit ? (
          <DepartmentColorField
            value={color}
            onChange={setColor}
            labelClassName="sr-only"
            containerClassName="flex h-11 items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 dark:border-slate-700 dark:bg-slate-900"
          />
        ) : (
          <span className="inline-flex items-center gap-2 text-xs text-gray-600 dark:text-slate-300">
            <span aria-hidden="true" className="h-4 w-4 rounded-full border border-black/10" style={{ backgroundColor: department.color }} />
            Cor: {department.color}
          </span>
        )}
        {canEdit ? (
          <button
            className={marketingPrimaryButtonClass}
            disabled={color === department.color || updateMutation.isPending}
            onClick={() => updateMutation.mutate(color)}
            type="button"
          >
            <Save aria-hidden="true" className="h-4 w-4" />
            {updateMutation.isPending ? "Salvando…" : "Salvar cor"}
          </button>
        ) : null}
        {updateMutation.isError ? <span className="text-xs text-red-600 dark:text-red-300" role="alert">Não foi possível salvar a cor.</span> : null}
        {updateMutation.isSuccess ? <span className="text-xs text-emerald-700 dark:text-emerald-300" role="status">Cor salva.</span> : null}
      </div>
    </li>
  );
}

export function MarketingDepartments() {
  const { access, isLoading: accessLoading, user } = useModuleAccess("marketing");
  const organizationId = user?.organization_id ?? null;
  const queryKey = marketingQueryKey(DEPARTMENTS_QUERY_ROOT, user);
  const departmentsQuery = useFetch(
    queryKey,
    () => departmentService.listForMarketing(),
    { enabled: access.canView && Boolean(organizationId), retry: false },
  );

  if (accessLoading) {
    return <p className="text-sm text-gray-500 dark:text-slate-400" role="status">Verificando acesso aos departamentos…</p>;
  }
  if (!access.canView) return null;

  return (
    <section aria-labelledby="marketing-departments-title" className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white" id="marketing-departments-title">Departamentos da organização</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">Consulte os departamentos e, com acesso administrativo do Marketing, mantenha suas cores.</p>
      </div>
      {departmentsQuery.isLoading ? (
        <p className="text-sm text-gray-500 dark:text-slate-400" role="status">Carregando departamentos…</p>
      ) : departmentsQuery.isError ? (
        <div>
          <p className="text-sm text-red-600 dark:text-red-300" role="alert">Não foi possível carregar os departamentos.</p>
          <button className={`mt-3 ${marketingSecondaryButtonClass}`} onClick={() => void departmentsQuery.refetch()} type="button">
            <RefreshCw aria-hidden="true" className="mr-2 inline h-4 w-4" />Tentar novamente
          </button>
        </div>
      ) : departmentsQuery.data?.length ? (
        <ul className="space-y-3">
          {departmentsQuery.data.map((department) => (
            <MarketingDepartmentRow canEdit={access.isAdmin} department={department} key={department.id} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-gray-500 dark:text-slate-400">Nenhum departamento encontrado.</p>
      )}
    </section>
  );
}
