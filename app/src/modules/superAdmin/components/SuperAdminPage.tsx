import { Activity, Building2, ShieldCheck, Users } from "lucide-react";
import { useEffect, useState } from "react";

import { useDebouncedValue } from "@shared/hooks/useDebouncedValue";

import { usePlatformOrganizations } from "../hooks/usePlatformOrganizations";
import type { PlatformOrganization } from "../types";
import { OrganizationDirectory } from "./OrganizationDirectory";
import { PlatformAuditPanel } from "./PlatformAuditPanel";
import { PlatformUsersPanel } from "./PlatformUsersPanel";

const PAGE_SIZE = 20;

export function SuperAdminPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [activePanel, setActivePanel] = useState<"users" | "audit">("users");
  const [selectedOrganization, setSelectedOrganization] = useState<PlatformOrganization | null>(null);
  const debouncedSearch = useDebouncedValue(search.trim(), 300);
  const organizationsQuery = usePlatformOrganizations({
    page,
    pageSize: PAGE_SIZE,
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
  });
  const organizations = organizationsQuery.data?.organizations ?? [];
  const total = organizationsQuery.data?.total ?? 0;

  useEffect(() => {
    if (!organizationsQuery.isSuccess || organizationsQuery.isPlaceholderData) return;

    if (organizations.length === 0) {
      setSelectedOrganization(null);
      return;
    }

    setSelectedOrganization((current) =>
      organizations.find((organization) => organization.id === current?.id) ?? organizations[0],
    );
  }, [organizations, organizationsQuery.isPlaceholderData, organizationsQuery.isSuccess]);

  return (
    <section className="mx-auto max-w-[1680px] space-y-5">
      <header className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950 px-5 py-5 text-white shadow-lg shadow-slate-950/10 sm:px-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-blue-400/30 bg-blue-500/15 text-blue-300">
              <ShieldCheck aria-hidden="true" className="h-6 w-6" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-300">Operações de plataforma</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">Console Super Admin</h1>
              <p className="mt-1 text-sm text-slate-400">Consulta isolada de organizações, usuários e eventos globais.</p>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-slate-700 bg-slate-700">
            <div className="min-w-32 bg-slate-900 px-4 py-2.5">
              <dt className="text-[11px] uppercase tracking-wider text-slate-400">Organizações</dt>
              <dd className="mt-0.5 text-lg font-semibold tabular-nums">{total}</dd>
            </div>
            <div className="min-w-36 bg-slate-900 px-4 py-2.5">
              <dt className="text-[11px] uppercase tracking-wider text-slate-400">Contexto</dt>
              <dd className="mt-1 truncate text-sm font-semibold">{selectedOrganization?.name ?? "Nenhum"}</dd>
            </div>
          </dl>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(19rem,23rem)_minmax(0,1fr)] lg:items-start">
        <OrganizationDirectory
          isError={organizationsQuery.isError}
          isFetching={organizationsQuery.isFetching}
          isLoading={organizationsQuery.isLoading}
          onPageChange={setPage}
          onRetry={() => void organizationsQuery.refetch()}
          onSearchChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          onSelect={setSelectedOrganization}
          organizations={organizations}
          page={page}
          pageSize={PAGE_SIZE}
          search={search}
          selectedId={selectedOrganization?.id ?? null}
          total={total}
        />

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-200 p-2 dark:border-slate-800">
            <div aria-label="Dados administrativos" className="flex gap-1" role="tablist">
              <button
                aria-controls="platform-users-panel"
                aria-selected={activePanel === "users"}
                className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${activePanel === "users" ? "bg-blue-50 text-blue-800 dark:bg-blue-950/50 dark:text-blue-200" : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"}`}
                id="platform-users-tab"
                onClick={() => setActivePanel("users")}
                role="tab"
                type="button"
              >
                <Users aria-hidden="true" className="h-4 w-4" /> Usuários
              </button>
              <button
                aria-controls="platform-audit-panel"
                aria-selected={activePanel === "audit"}
                className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${activePanel === "audit" ? "bg-blue-50 text-blue-800 dark:bg-blue-950/50 dark:text-blue-200" : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"}`}
                id="platform-audit-tab"
                onClick={() => setActivePanel("audit")}
                role="tab"
                type="button"
              >
                <Activity aria-hidden="true" className="h-4 w-4" /> Auditoria global
              </button>
            </div>
          </div>

          <div aria-labelledby="platform-users-tab" hidden={activePanel !== "users"} id="platform-users-panel" role="tabpanel">
            {selectedOrganization ? (
              <PlatformUsersPanel
                key={selectedOrganization.id}
                organization={selectedOrganization}
              />
            ) : (
              <div className="flex min-h-[34rem] flex-col items-center justify-center px-6 text-center">
                <Building2 aria-hidden="true" className="h-8 w-8 text-slate-400" />
                <p className="mt-3 text-sm font-semibold text-slate-900 dark:text-white">Selecione uma organização</p>
                <p className="mt-1 max-w-sm text-xs text-slate-500 dark:text-slate-400">Os usuários são consultados somente após a seleção de um tenant.</p>
              </div>
            )}
          </div>
          <div aria-labelledby="platform-audit-tab" hidden={activePanel !== "audit"} id="platform-audit-panel" role="tabpanel">
            {activePanel === "audit" ? <PlatformAuditPanel /> : null}
          </div>
        </div>
      </div>
    </section>
  );
}
