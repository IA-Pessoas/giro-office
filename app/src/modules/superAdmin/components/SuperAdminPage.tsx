import { Activity, Building2, LayoutDashboard, ShieldCheck, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useDebouncedValue } from "@shared/hooks/useDebouncedValue";
import { formatOrganizationCnpj } from "@modules/organizations/utils/organizationUi";

import {
  usePlatformOrganizationDetail,
  usePlatformOrganizations,
} from "../hooks/usePlatformOrganizations";
import { PLATFORM_PLAN_LABELS, PLATFORM_STATUS_LABELS } from "../utils/platformManagement";
import { CreateOrganizationDialog } from "./CreateOrganizationDialog";
import { OrganizationDirectory } from "./OrganizationDirectory";
import { OrganizationOverviewPanel } from "./OrganizationOverviewPanel";
import { PlatformAuditPanel } from "./PlatformAuditPanel";
import { PlatformUsersPanel } from "./PlatformUsersPanel";

const PAGE_SIZE = 20;

export function SuperAdminPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [activePanel, setActivePanel] = useState<"overview" | "users" | "audit">("overview");
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const createButtonRef = useRef<HTMLButtonElement>(null);
  const debouncedSearch = useDebouncedValue(search.trim(), 300);
  const organizationsQuery = usePlatformOrganizations({
    page,
    pageSize: PAGE_SIZE,
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
  });
  const organizations = organizationsQuery.data?.organizations ?? [];
  const total = organizationsQuery.data?.total ?? 0;
  const organizationDetailQuery = usePlatformOrganizationDetail(selectedOrganizationId);
  const selectedOrganization = organizationDetailQuery.data ?? null;

  useEffect(() => {
    if (!organizationsQuery.isSuccess || organizationsQuery.isPlaceholderData) return;
    if (!selectedOrganizationId && organizations[0]) {
      setSelectedOrganizationId(organizations[0].id);
    }
  }, [
    organizations,
    organizationsQuery.isPlaceholderData,
    organizationsQuery.isSuccess,
    selectedOrganizationId,
  ]);

  return (
    <section className="mx-auto max-w-[1680px] space-y-5">
      <header className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950 px-5 py-5 text-white shadow-lg shadow-slate-950/10 sm:px-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-blue-400/30 bg-blue-500/15 text-blue-300">
              <ShieldCheck aria-hidden="true" className="h-6 w-6" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-300">
                Operações de plataforma
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">Console Super Admin</h1>
              <p className="mt-1 text-sm text-slate-400">
                Gestão de organizações, consulta de usuários e auditoria da plataforma.
              </p>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-slate-700 bg-slate-700">
            <div className="min-w-32 bg-slate-900 px-4 py-2.5">
              <dt className="text-[11px] uppercase tracking-wider text-slate-400">Organizações</dt>
              <dd className="mt-0.5 text-lg font-semibold tabular-nums">{total}</dd>
            </div>
            <div className="min-w-36 bg-slate-900 px-4 py-2.5">
              <dt className="text-[11px] uppercase tracking-wider text-slate-400">Contexto</dt>
              <dd className="mt-1 truncate text-sm font-semibold">
                {selectedOrganization?.name ?? "Nenhum"}
              </dd>
            </div>
          </dl>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(19rem,23rem)_minmax(0,1fr)] lg:items-start">
        <OrganizationDirectory
          createButtonRef={createButtonRef}
          isError={organizationsQuery.isError}
          isFetching={organizationsQuery.isFetching}
          isLoading={organizationsQuery.isLoading}
          onCreate={() => setIsCreateOpen(true)}
          onPageChange={setPage}
          onRetry={() => void organizationsQuery.refetch()}
          onSearchChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          onSelect={(organizationId) => {
            setSelectedOrganizationId(organizationId);
            setActivePanel("overview");
          }}
          organizations={organizations}
          page={page}
          pageSize={PAGE_SIZE}
          search={search}
          selectedId={selectedOrganizationId}
          total={total}
        />

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-200 p-2 dark:border-slate-800">
            <div className="flex flex-wrap gap-1">
              <button
                aria-pressed={activePanel === "overview"}
                className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-600 ${activePanel === "overview" ? "bg-blue-50 text-blue-800 dark:bg-blue-950/50 dark:text-blue-200" : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"}`}
                onClick={() => setActivePanel("overview")}
                type="button"
              >
                <LayoutDashboard aria-hidden="true" className="h-4 w-4" /> Visão geral
              </button>
              <button
                aria-pressed={activePanel === "users"}
                className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-600 ${activePanel === "users" ? "bg-blue-50 text-blue-800 dark:bg-blue-950/50 dark:text-blue-200" : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"}`}
                onClick={() => setActivePanel("users")}
                type="button"
              >
                <Users aria-hidden="true" className="h-4 w-4" /> Usuários
              </button>
              <button
                aria-pressed={activePanel === "audit"}
                className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-600 ${activePanel === "audit" ? "bg-blue-50 text-blue-800 dark:bg-blue-950/50 dark:text-blue-200" : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"}`}
                onClick={() => setActivePanel("audit")}
                type="button"
              >
                <Activity aria-hidden="true" className="h-4 w-4" /> Auditoria
              </button>
            </div>
          </div>

          {selectedOrganizationId && organizationDetailQuery.isLoading ? (
            <div className="space-y-4 p-5" role="status">
              <span className="sr-only">Carregando detalhes da organização...</span>
              <div className="h-16 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
              <div className="h-64 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
            </div>
          ) : selectedOrganizationId &&
            (organizationDetailQuery.isError || !selectedOrganization) ? (
            <div
              className="m-4 rounded-lg bg-rose-50 p-4 text-sm text-rose-900 dark:bg-rose-950/30 dark:text-rose-100"
              role="alert"
            >
              <p>Não foi possível carregar os detalhes da organização.</p>
              <button
                className="mt-3 font-semibold underline underline-offset-4"
                onClick={() => void organizationDetailQuery.refetch()}
                type="button"
              >
                Tentar novamente
              </button>
            </div>
          ) : activePanel === "audit" ? (
            <PlatformAuditPanel organization={selectedOrganization} />
          ) : !selectedOrganization ? (
            <div className="flex min-h-[34rem] flex-col items-center justify-center px-6 text-center">
              <Building2
                aria-hidden="true"
                className="h-8 w-8 text-slate-500 dark:text-slate-400"
              />
              <p className="mt-3 text-sm font-semibold text-slate-900 dark:text-white">
                Selecione ou crie uma organização
              </p>
              <p className="mt-1 max-w-sm text-xs text-slate-600 dark:text-slate-300">
                O detalhe e os usuários aparecem após uma seleção no diretório.
              </p>
            </div>
          ) : (
            <>
              <header className="border-b border-slate-200 px-4 py-4 dark:border-slate-800">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h2 className="truncate text-xl font-semibold text-slate-950 dark:text-white">
                      {selectedOrganization.name}
                    </h2>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                      {formatOrganizationCnpj(selectedOrganization.cnpj)} ·{" "}
                      {selectedOrganization.slug}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs font-semibold">
                    <span className="rounded-full bg-blue-50 px-2.5 py-1 text-blue-800 dark:bg-blue-950/50 dark:text-blue-200">
                      {PLATFORM_STATUS_LABELS[selectedOrganization.status]}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                      Plano {PLATFORM_PLAN_LABELS[selectedOrganization.subscription_plan]}
                    </span>
                  </div>
                </div>
                <p className="mt-3 text-xs text-slate-600 dark:text-slate-300">
                  Atualizada em {new Date(selectedOrganization.updated_at).toLocaleString("pt-BR")}
                </p>
              </header>
              {activePanel === "overview" ? (
                <OrganizationOverviewPanel
                  key={selectedOrganization.id}
                  organization={selectedOrganization}
                />
              ) : (
                <PlatformUsersPanel
                  key={selectedOrganization.id}
                  organization={selectedOrganization}
                />
              )}
            </>
          )}
        </div>
      </div>

      <CreateOrganizationDialog
        onCreated={(organization) => {
          setSearch("");
          setPage(1);
          setSelectedOrganizationId(organization.id);
          setActivePanel("overview");
        }}
        onOpenChange={setIsCreateOpen}
        onCloseAutoFocus={() => createButtonRef.current?.focus()}
        open={isCreateOpen}
      />
    </section>
  );
}
