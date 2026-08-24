import { Building2, Search } from "lucide-react";

import { formatOrganizationCnpj } from "@modules/organizations/utils/organizationUi";
import { PaginationControls } from "@shared/components/ui/PaginationControls";
import { Input } from "@shared/ui/newLayout/input";

import type { PlatformOrganization } from "../types";

interface OrganizationDirectoryProps {
  organizations: PlatformOrganization[];
  total: number;
  page: number;
  pageSize: number;
  search: string;
  selectedId: string | null;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  onSearchChange: (value: string) => void;
  onSelect: (organization: PlatformOrganization) => void;
  onPageChange: (page: number) => void;
  onRetry: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  active: "Ativa",
  trial: "Trial",
  past_due: "Em atraso",
  suspended: "Suspensa",
  cancelled: "Cancelada",
};

export function OrganizationDirectory({
  organizations,
  total,
  page,
  pageSize,
  search,
  selectedId,
  isLoading,
  isFetching,
  isError,
  onSearchChange,
  onSelect,
  onPageChange,
  onRetry,
}: OrganizationDirectoryProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <aside className="flex min-h-[34rem] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="border-b border-slate-200 px-4 py-4 dark:border-slate-800">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-700 dark:text-blue-300">
              Diretório
            </p>
            <h2 className="mt-1 text-lg font-semibold text-slate-950 dark:text-white">
              Organizações
            </h2>
          </div>
          <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400">
            {total} no total
          </span>
        </div>

        <label
          className="mt-4 block text-xs font-medium text-slate-600 dark:text-slate-300"
          htmlFor="platform-organization-search"
        >
          Pesquisar organização
        </label>
        <div className="relative mt-1.5">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          />
          <Input
            className="bg-white pl-9 dark:bg-slate-950"
            id="platform-organization-search"
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Nome, slug ou CNPJ"
            type="search"
            value={search}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2" aria-busy={isLoading || isFetching}>
        {isLoading ? (
          <div className="space-y-2 p-1" role="status">
            <span className="sr-only">Carregando organizações...</span>
            {[0, 1, 2, 3, 4].map((item) => (
              <div
                className="h-[76px] animate-pulse rounded-lg border border-slate-100 bg-slate-100 dark:border-slate-800 dark:bg-slate-800"
                key={item}
              />
            ))}
          </div>
        ) : isError ? (
          <div className="m-2 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-100" role="alert">
            <p>Não foi possível carregar as organizações.</p>
            <button className="mt-3 font-semibold underline underline-offset-4" onClick={onRetry} type="button">
              Tentar novamente
            </button>
          </div>
        ) : organizations.length === 0 ? (
          <div className="flex min-h-56 flex-col items-center justify-center px-6 text-center">
            <Building2 aria-hidden="true" className="h-7 w-7 text-slate-400" />
            <p className="mt-3 text-sm font-semibold text-slate-900 dark:text-white">
              Nenhuma organização encontrada
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Revise o termo pesquisado.
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {organizations.map((organization) => {
              const isSelected = organization.id === selectedId;

              return (
                <button
                  aria-pressed={isSelected}
                  className={`w-full rounded-lg border px-3 py-3 text-left transition-colors ${
                    isSelected
                      ? "border-blue-300 bg-blue-50 text-blue-950 dark:border-blue-700 dark:bg-blue-950/40 dark:text-white"
                      : "border-transparent text-slate-800 hover:border-slate-200 hover:bg-slate-50 dark:text-slate-100 dark:hover:border-slate-700 dark:hover:bg-slate-800"
                  }`}
                  key={organization.id}
                  onClick={() => onSelect(organization)}
                  type="button"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{organization.name}</p>
                      <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                        {organization.slug} · {formatOrganizationCnpj(organization.cnpj)}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full border border-current/15 bg-white/70 px-2 py-0.5 text-[11px] font-semibold dark:bg-slate-950/40">
                      {STATUS_LABELS[organization.status] ?? organization.status}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <PaginationControls
        count={organizations.length}
        hasMore={page < totalPages}
        isFetching={isFetching}
        limit={pageSize}
        onFirst={() => onPageChange(1)}
        onLast={() => onPageChange(totalPages)}
        onNext={() => onPageChange(page + 1)}
        onPageChange={onPageChange}
        onPrevious={() => onPageChange(page - 1)}
        page={page}
        total={total}
        totalPages={totalPages}
      />
    </aside>
  );
}
