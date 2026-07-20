import { useEffect, useMemo, useState } from "react";
import { Building2, RefreshCw, ShieldCheck, Users } from "lucide-react";

import { usePlatformOrganizations } from "../hooks/usePlatformOrganizations";
import type { PlatformOrganization } from "../types";
import { OrganizationDetailPanel, type SuperAdminDetailTab } from "./OrganizationDetailPanel";
import { OrganizationDirectory } from "./OrganizationDirectory";

const ORGANIZATIONS_PAGE_SIZE = 20;

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function filterOrganizations(
  organizations: PlatformOrganization[],
  searchTerm: string,
): PlatformOrganization[] {
  const normalizedSearch = normalizeSearchText(searchTerm);

  if (!normalizedSearch) {
    return organizations;
  }

  return organizations.filter((organization) => {
    const searchableValues = [
      organization.name,
      organization.slug,
      organization.cnpj,
      organization.email_created_by,
      organization.subscription_plan,
      organization.status,
    ];

    return searchableValues.some((value) => normalizeSearchText(value ?? "").includes(normalizedSearch));
  });
}

export function SuperAdminPage() {
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<SuperAdminDetailTab>("overview");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [organizationPage, setOrganizationPage] = useState(1);

  const organizationsQuery = usePlatformOrganizations({
    page: organizationPage,
    pageSize: ORGANIZATIONS_PAGE_SIZE,
    ...(statusFilter === "all" ? {} : { status: statusFilter }),
  });

  const organizations = organizationsQuery.data?.organizations ?? [];
  const filteredOrganizations = useMemo(
    () => filterOrganizations(organizations, searchTerm),
    [organizations, searchTerm],
  );
  const selectedOrganization =
    filteredOrganizations.find((organization) => organization.id === selectedOrganizationId) ?? null;

  useEffect(() => {
    if (!organizationsQuery.isSuccess || organizationsQuery.isPlaceholderData) {
      return;
    }

    if (filteredOrganizations.length === 0) {
      setSelectedOrganizationId(null);
      return;
    }

    setSelectedOrganizationId((currentOrganizationId) => {
      if (
        currentOrganizationId &&
        filteredOrganizations.some((organization) => organization.id === currentOrganizationId)
      ) {
        return currentOrganizationId;
      }

      return filteredOrganizations[0]?.id ?? null;
    });
  }, [filteredOrganizations, organizationsQuery.isPlaceholderData, organizationsQuery.isSuccess]);

  useEffect(() => {
    setOrganizationPage(1);
  }, [statusFilter]);

  const totalOrganizations = organizationsQuery.data?.total ?? organizations.length;

  return (
    <section className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="mb-1 flex items-center gap-3 text-3xl font-bold text-gray-900 dark:text-white">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--colors-brand-gradient-start)] to-[var(--colors-brand-gradient-end)] text-white shadow-lg shadow-blue-950/20">
              <ShieldCheck className="h-6 w-6" />
            </span>
            Super Admin
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Operacao global de organizacoes e usuarios da plataforma.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center gap-3">
              <Building2 className="h-5 w-5 text-[var(--colors-brand-strong)] dark:text-blue-300" />
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Organizacoes
                </p>
                <p className="text-lg font-semibold text-slate-900 dark:text-white">
                  {totalOrganizations}
                </p>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center gap-3">
              <Users className="h-5 w-5 text-[var(--colors-brand-strong)] dark:text-blue-300" />
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Contexto
                </p>
                <p className="max-w-[170px] truncate text-lg font-semibold text-slate-900 dark:text-white">
                  {selectedOrganization?.name ?? "Nenhum"}
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {organizationsQuery.isError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/90 p-4 text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-100">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-medium">Nao foi possivel carregar organizacoes.</p>
            <button
              type="button"
              onClick={() => void organizationsQuery.refetch()}
              className="inline-flex w-fit items-center gap-2 rounded-xl border border-rose-200 px-3 py-2 text-sm font-medium transition-colors hover:bg-rose-100 dark:border-rose-900/60 dark:hover:bg-rose-900/30"
            >
              <RefreshCw className="h-4 w-4" />
              Tentar novamente
            </button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 xl:h-[742px] xl:grid-cols-[360px_minmax(0,1fr)] xl:items-stretch">
        <OrganizationDirectory
          organizations={filteredOrganizations}
          totalOrganizations={totalOrganizations}
          selectedOrganizationId={selectedOrganizationId}
          searchTerm={searchTerm}
          statusFilter={statusFilter}
          page={organizationPage}
          pageSize={ORGANIZATIONS_PAGE_SIZE}
          isLoading={organizationsQuery.isLoading}
          isFetching={organizationsQuery.isFetching}
          isError={organizationsQuery.isError}
          onSearchTermChange={setSearchTerm}
          onStatusFilterChange={setStatusFilter}
          onSelectOrganization={setSelectedOrganizationId}
          onPreviousPage={() => setOrganizationPage((currentPage) => Math.max(1, currentPage - 1))}
          onNextPage={() => setOrganizationPage((currentPage) => currentPage + 1)}
          onRetry={() => void organizationsQuery.refetch()}
        />

        <OrganizationDetailPanel
          organization={selectedOrganization}
          activeTab={activeTab}
          onChangeTab={setActiveTab}
        />
      </div>
    </section>
  );
}
