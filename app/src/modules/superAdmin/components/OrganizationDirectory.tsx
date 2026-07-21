import {
  Building2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  RefreshCw,
  Search,
} from "lucide-react";

import type { PlatformOrganization } from "../types";

interface OrganizationDirectoryProps {
  organizations: PlatformOrganization[];
  totalOrganizations: number;
  selectedOrganizationId: string | null;
  searchTerm: string;
  statusFilter: string;
  page: number;
  pageSize: number;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  onSearchTermChange: (value: string) => void;
  onStatusFilterChange: (value: string) => void;
  onSelectOrganization: (organizationId: string) => void;
  onFirstPage: () => void;
  onPreviousPage: () => void;
  onNextPage: () => void;
  onLastPage: () => void;
  onRetry: () => void;
}

const STATUS_OPTIONS = [
  { value: "active", label: "Ativas" },
  { value: "trial", label: "Trial" },
  { value: "past_due", label: "Em atraso" },
  { value: "suspended", label: "Suspensas" },
  { value: "cancelled", label: "Canceladas" },
  { value: "all", label: "Todas" },
] as const;

function getStatusLabel(status: string): string {
  const normalizedStatus = status.trim().toLowerCase();

  if (normalizedStatus === "active") {
    return "Ativa";
  }

  if (normalizedStatus === "trial") {
    return "Trial";
  }

  if (normalizedStatus === "past_due") {
    return "Em atraso";
  }

  if (normalizedStatus === "suspended") {
    return "Suspensa";
  }

  if (normalizedStatus === "cancelled") {
    return "Cancelada";
  }

  return status || "Sem status";
}

export function OrganizationDirectory({
  organizations,
  totalOrganizations,
  selectedOrganizationId,
  searchTerm,
  statusFilter,
  page,
  pageSize,
  isLoading,
  isFetching,
  isError,
  onSearchTermChange,
  onStatusFilterChange,
  onSelectOrganization,
  onFirstPage,
  onPreviousPage,
  onNextPage,
  onLastPage,
  onRetry,
}: OrganizationDirectoryProps) {
  const totalPages = Math.max(1, Math.ceil(totalOrganizations / pageSize));
  const canGoToFirstPage = page > 1 && !isFetching;
  const canGoToPreviousPage = page > 1 && !isFetching;
  const canGoToNextPage = page < totalPages && !isFetching;
  const canGoToLastPage = page < totalPages && !isFetching;

  return (
    <aside className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900 max-xl:h-[620px] xl:h-full">
      <div className="flex h-full min-h-0 flex-col space-y-4">
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            Organizações
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {organizations.length} de {totalOrganizations}{" "}
            {totalOrganizations === 1 ? "organização" : "organizações"}
          </p>
        </div>

        <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-950/40">
          <label className="block text-sm font-medium text-slate-700 dark:text-white">
            Busca
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => onSearchTermChange(event.target.value)}
              placeholder="Nome, slug ou CNPJ"
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-900 shadow-sm outline-none transition-all placeholder:text-slate-400 focus:border-[var(--colors-brand-gradient-end)] focus:ring-2 focus:ring-[var(--colors-brand-gradient-start)]/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500"
            />
          </div>

          <label className="block text-sm font-medium text-slate-700 dark:text-white">
            Status
          </label>
          <select
            value={statusFilter}
            onChange={(event) => onStatusFilterChange(event.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition-all focus:border-[var(--colors-brand-gradient-end)] focus:ring-2 focus:ring-[var(--colors-brand-gradient-start)]/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          {isLoading ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-6 text-center dark:border-slate-700 dark:bg-slate-950/40">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Carregando organizações...
              </p>
            </div>
          ) : isError ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-6 text-center dark:border-slate-700 dark:bg-slate-950/40">
              <p className="text-sm text-slate-700 dark:text-white">
                A listagem não está disponível.
              </p>
              <button
                type="button"
                onClick={onRetry}
                className="mt-3 inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <RefreshCw className="h-4 w-4" />
                Tentar novamente
              </button>
            </div>
          ) : organizations.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-6 text-center dark:border-slate-700 dark:bg-slate-950/40">
              <Building2 className="mx-auto mb-3 h-6 w-6 text-slate-400" />
              <p className="text-sm font-medium text-slate-700 dark:text-white">
                Nenhuma organização encontrada.
              </p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-300">
                Ajuste a busca ou o filtro.
              </p>
            </div>
          ) : (
            organizations.map((organization) => {
              const isSelected = organization.id === selectedOrganizationId;

              return (
                <button
                  key={organization.id}
                  type="button"
                  onClick={() => onSelectOrganization(organization.id)}
                  className={`w-full rounded-2xl border p-4 text-left transition-all ${
                    isSelected
                      ? "border-[var(--colors-brand-gradient-end)] bg-slate-50 shadow-sm dark:bg-slate-950/60"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600 dark:hover:bg-slate-800/70"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                        {organization.name}
                      </p>
                      <p className="truncate text-sm text-slate-600 dark:text-slate-300">
                        {organization.slug}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-[var(--colors-brand-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--colors-brand-strong)] dark:bg-blue-900/30 dark:text-blue-300">
                      {getStatusLabel(organization.status)}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
                    <span className="truncate">{organization.subscription_plan}</span>
                    <span className="shrink-0">{organization.cnpj}</span>
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-slate-200 pt-3 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onFirstPage}
              disabled={!canGoToFirstPage}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-45 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              aria-label="Primeira página de organizações"
            >
              <ChevronsLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onPreviousPage}
              disabled={!canGoToPreviousPage}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-45 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              aria-label="Página anterior de organizações"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </div>
          <p className="shrink-0 text-sm font-medium text-slate-600 dark:text-slate-300">
            Página {page} de {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onNextPage}
              disabled={!canGoToNextPage}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-45 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              aria-label="Próxima página de organizações"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onLastPage}
              disabled={!canGoToLastPage}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-45 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              aria-label="Última página de organizações"
            >
              <ChevronsRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
