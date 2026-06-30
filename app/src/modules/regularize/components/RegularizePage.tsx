import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import {
  Activity,
  ArrowRight,
  BadgeCheck,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Eye,
  FileKey2,
  Landmark,
  Loader2,
  RefreshCw,
  ShieldCheck,
  UserRound,
  UsersRound,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import { StatusBadge, type StatusBadgeConfig } from "@shared/components/StatusBadge";
import { cn } from "@shared/ui/newLayout/utils";

import {
  useRegularizePasswordDetail,
  useRegularizePasswords,
  useRegularizeSitePasswordDetail,
  useRegularizeSitePasswords,
} from "../hooks/useRegularizeCredentials";
import {
  useRegularizeClientPfDetail,
  useRegularizeClientPfs,
  useRegularizePartners,
} from "../hooks/useRegularizePeople";
import {
  useRegularizeGuidance,
  useRegularizeLicenses,
  useRegularizeMunicipalTaxes,
  useRegularizeProcessDetail,
  useRegularizeProcesses,
} from "../hooks/useRegularizeOperations";
import type {
  RegularizeCapability,
  RegularizeClientPfListItem,
  RegularizeGuidance,
  RegularizeId,
  RegularizeLicenseListItem,
  RegularizeMunicipalTaxesClientSummary,
  RegularizePartner,
  RegularizePasswordListItem,
  RegularizeProcessListItem,
  RegularizeSitePasswordListItem,
  RegularizeStatus,
} from "../types";

type RegularizeTabId =
  | "dashboard"
  | "processes"
  | "licenses"
  | "pf"
  | "partners"
  | "passwords"
  | "sites"
  | "taxes";

type RegularizeTab = {
  id: RegularizeTabId;
  label: string;
  icon: LucideIcon;
};

type ListQuery<T> = Pick<
  UseQueryResult<T[], Error>,
  "data" | "error" | "isError" | "isFetching" | "isLoading" | "refetch"
>;

const REGULARIZE_TABS: RegularizeTab[] = [
  { id: "dashboard", label: "Dashboard", icon: BarChart3 },
  { id: "processes", label: "Processos", icon: ClipboardList },
  { id: "licenses", label: "Licenças", icon: BadgeCheck },
  { id: "pf", label: "PF", icon: UserRound },
  { id: "partners", label: "Sócios", icon: UsersRound },
  { id: "passwords", label: "Senhas", icon: FileKey2 },
  { id: "sites", label: "Sites", icon: ShieldCheck },
  { id: "taxes", label: "Tributos", icon: Landmark },
];

const REGULARIZE_CAPABILITIES: RegularizeCapability[] = ["credentials:reveal"];

function normalizeStatus(status: RegularizeStatus | null | undefined): string {
  if (typeof status === "boolean") {
    return status ? "ativo" : "inativo";
  }

  return String(status ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function getStatusBadgeConfig(status: RegularizeStatus | null | undefined): StatusBadgeConfig {
  const normalized = normalizeStatus(status);

  if (normalized === "ativo" || normalized === "concluido") {
    return { label: status ? String(status) : "Ativo", variant: "success", icon: CheckCircle2 };
  }

  if (normalized === "inativo" || normalized === "cancelado" || normalized === "encerrado") {
    return { label: status ? String(status) : "Inativo", variant: "neutral", icon: XCircle };
  }

  if (normalized === "aberto" || normalized === "em andamento") {
    return { label: status ? String(status) : "Em andamento", variant: "info", icon: Activity };
  }

  if (normalized === "pendente" || normalized === "a vencer" || normalized === "urgente") {
    return { label: status ? String(status) : "Pendente", variant: "warning", icon: CalendarDays };
  }

  return { label: status ? String(status) : "Sem status", variant: "neutral" };
}

function formatText(value: unknown, fallback = "-"): string {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  return String(value);
}

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(date);
}

function getProcessClientName(item: RegularizeProcessListItem): string {
  return item.clientPJ?.name ?? item.clientPF?.name ?? item.cpf_cnpj ?? "-";
}

function hasCredentialRevealCapability(capabilities: RegularizeCapability[]): boolean {
  return capabilities.includes("credentials:reveal");
}

function DashboardSectionCard({
  actionLabel,
  children,
  description,
  onAction,
  title,
}: {
  actionLabel?: string;
  children: ReactNode;
  description: string;
  onAction?: () => void;
  title: string;
}) {
  return (
    <section className="flex h-full flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{description}</p>
        </div>
        {actionLabel && onAction ? (
          <button
            type="button"
            onClick={onAction}
            className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-blue-600 transition-colors hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
          >
            <span>{actionLabel}</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      <div className="flex-1">{children}</div>
    </section>
  );
}

function DashboardHeroCard({
  description,
  icon: Icon,
  label,
  value,
}: {
  description: string;
  icon: LucideIcon;
  label: string;
  value: number | string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-700 via-blue-600 to-violet-600 p-5 text-white shadow-sm">
      <div className="flex min-h-[180px] items-start justify-between gap-5">
        <div className="min-w-0">
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-white/85">
            {label}
          </p>
          <p className="mt-3 text-4xl font-semibold tracking-tight">{value}</p>
          <p className="mt-3 max-w-md text-sm leading-6 text-white/75">{description}</p>
        </div>
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 text-white">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function MetricTile({
  icon: Icon,
  label,
  value,
  supporting,
}: {
  icon: LucideIcon;
  label: string;
  value: number | string;
  supporting?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="flex min-h-[72px] flex-col justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
            <Icon className="h-4 w-4" />
          </div>
          <p className="min-w-0 text-[13px] font-semibold uppercase tracking-[0.04em] text-gray-600 dark:text-gray-300">
            {label}
          </p>
        </div>
        <div className="pl-12">
          <p className="text-[1.4rem] font-semibold tracking-tight text-gray-900 dark:text-white">
            {value}
          </p>
          {supporting ? (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{supporting}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function QueryStatePanel<T>({
  children,
  emptyTitle,
  query,
}: {
  children: (rows: T[]) => ReactNode;
  emptyTitle: string;
  query: ListQuery<T>;
}) {
  if (query.isLoading) {
    return (
      <div className="flex min-h-32 items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-6 text-sm text-gray-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando dados...
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900/40 dark:bg-red-950/20">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-red-700 dark:text-red-300">
              Não foi possível carregar.
            </p>
            <p className="mt-1 text-sm text-red-600 dark:text-red-300/80">
              {query.error?.message ?? "Tente novamente."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              void query.refetch();
            }}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-3 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200 dark:hover:bg-red-950/50"
          >
            <RefreshCw className="h-4 w-4" />
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  const rows = query.data ?? [];

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white px-4 py-8 text-center text-sm text-gray-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
        {emptyTitle}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {query.isFetching ? (
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-slate-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Atualizando...
        </div>
      ) : null}
      {children(rows)}
    </div>
  );
}

function DataTable({
  children,
  headers,
}: {
  children: ReactNode;
  headers: string[];
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-slate-700">
        <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-slate-800/60 dark:text-slate-400">
          <tr>
            {headers.map((header) => (
              <th key={header} scope="col" className="px-4 py-3 text-left font-semibold">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-slate-800">{children}</tbody>
      </table>
    </div>
  );
}

function DetailPanel({ children, title }: { children: ReactNode; title: string }) {
  return (
    <aside className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-slate-700 dark:bg-slate-950/30">
      <h3 className="text-sm font-semibold text-gray-950 dark:text-white">{title}</h3>
      <div className="mt-3 space-y-2 text-sm text-gray-600 dark:text-slate-300">{children}</div>
    </aside>
  );
}

function FieldLine({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-gray-100 pb-2 last:border-b-0 last:pb-0 dark:border-slate-800">
      <span className="shrink-0 text-xs font-medium uppercase text-gray-500 dark:text-slate-500">
        {label}
      </span>
      <span className="min-w-0 text-right font-medium text-gray-800 dark:text-slate-100">
        {value}
      </span>
    </div>
  );
}

function TabButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-5 py-2.5 font-medium transition-all",
        active
          ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
          : "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700",
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function MaskedValue() {
  return <span className="font-mono text-gray-500 dark:text-slate-400">********</span>;
}

export function RegularizePage() {
  const [activeTab, setActiveTab] = useState<RegularizeTabId>("dashboard");
  const [selectedClientPfId, setSelectedClientPfId] = useState<RegularizeId>();
  const [selectedProcessId, setSelectedProcessId] = useState<RegularizeId>();
  const [activePasswordId, setActivePasswordId] = useState<RegularizeId>();
  const [activeSitePasswordId, setActiveSitePasswordId] = useState<RegularizeId>();

  const currentYear = useMemo(() => new Date().getFullYear(), []);
  const canRevealCredentials = hasCredentialRevealCapability(REGULARIZE_CAPABILITIES);

  const pfQuery = useRegularizeClientPfs({ status: "Ativo" });
  const siteQuery = useRegularizeSitePasswords({ status: true });
  const taxQuery = useRegularizeMunicipalTaxes({ year: currentYear });
  const processQuery = useRegularizeProcesses({ status: "Todos" });
  const licenseQuery = useRegularizeLicenses({ status: "Ativo" });

  const firstClientPfId = pfQuery.data?.[0]?.id;
  const firstProcessId = processQuery.data?.[0]?.id;
  const currentClientPfId = selectedClientPfId ?? firstClientPfId;
  const currentProcessId = selectedProcessId ?? firstProcessId;

  const partnerQuery = useRegularizePartners(
    currentClientPfId ? { type: "pf", client_id: currentClientPfId } : undefined,
  );
  const credentialQuery = useRegularizePasswords(
    currentClientPfId ? { client_id: currentClientPfId } : undefined,
  );
  const guidanceQuery = useRegularizeGuidance(
    currentProcessId ? { process_id: currentProcessId } : undefined,
  );
  const clientPfDetailQuery = useRegularizeClientPfDetail(currentClientPfId, {
    enabled: activeTab === "pf",
  });
  const processDetailQuery = useRegularizeProcessDetail(currentProcessId, {
    enabled: activeTab === "processes",
  });
  const passwordDetailQuery = useRegularizePasswordDetail(activePasswordId, {
    enabled: canRevealCredentials,
  });
  const sitePasswordDetailQuery = useRegularizeSitePasswordDetail(activeSitePasswordId, {
    enabled: canRevealCredentials,
  });

  useEffect(() => {
    if (!selectedClientPfId && firstClientPfId) {
      setSelectedClientPfId(firstClientPfId);
    }
  }, [firstClientPfId, selectedClientPfId]);

  useEffect(() => {
    if (!selectedProcessId && firstProcessId) {
      setSelectedProcessId(firstProcessId);
    }
  }, [firstProcessId, selectedProcessId]);

  const metricData = useMemo(() => {
    const taxRows = taxQuery.data ?? [];
    const processRows = processQuery.data ?? [];
    const completedTaxRows = taxRows.filter((item) => (item.municipalTaxes?.length ?? 0) > 0);
    const openProcessRows = processRows.filter((item) => {
      const normalized = normalizeStatus(item.status);

      return !["cancelado", "concluido", "encerrado"].includes(normalized);
    });

    return {
      activePfs: pfQuery.data?.length ?? 0,
      activeLicenses: licenseQuery.data?.length ?? 0,
      openProcesses: openProcessRows.length,
      processTotal: processRows.length,
      siteTotal: siteQuery.data?.length ?? 0,
      taxesDone: completedTaxRows.length,
      taxesPending: Math.max(taxRows.length - completedTaxRows.length, 0),
      taxesTotal: taxRows.length,
    };
  }, [licenseQuery.data, pfQuery.data, processQuery.data, siteQuery.data, taxQuery.data]);

  function handleRefreshRegularize() {
    void Promise.all([
      pfQuery.refetch(),
      siteQuery.refetch(),
      taxQuery.refetch(),
      processQuery.refetch(),
      licenseQuery.refetch(),
      partnerQuery.refetch(),
      credentialQuery.refetch(),
      guidanceQuery.refetch(),
    ]);
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="mb-1 flex items-center gap-3 text-3xl font-bold text-gray-900 dark:text-white">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-600">
              <ShieldCheck className="h-6 w-6 text-white" />
            </div>
            Regularize
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Processos, licenças, tributos e credenciais em um único fluxo.
          </p>
        </div>

        <button
          type="button"
          onClick={handleRefreshRegularize}
          className="hidden items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 sm:flex"
        >
          <RefreshCw className="h-4 w-4" />
          <span>Atualizar dados</span>
        </button>
      </header>

      <nav
        aria-label="Abas do Regularize"
        className="rounded-xl border border-gray-200 bg-white p-1 dark:border-gray-700 dark:bg-gray-800"
      >
        <div className="overflow-x-auto">
          <div role="tablist" className="flex min-w-max items-center justify-center gap-1 md:min-w-full">
            {REGULARIZE_TABS.map((tab) => (
              <TabButton
                key={tab.id}
                active={activeTab === tab.id}
                icon={tab.icon}
                label={tab.label}
                onClick={() => setActiveTab(tab.id)}
              />
            ))}
          </div>
        </div>
      </nav>

      {activeTab === "dashboard" ? (
        <section className="space-y-5">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)] xl:items-stretch">
            <DashboardHeroCard
              icon={ClipboardList}
              label={
                metricData.openProcesses > 0
                  ? "Processos em acompanhamento"
                  : "Fluxo operacional em dia"
              }
              value={processQuery.isLoading ? "--" : metricData.openProcesses}
              description={
                metricData.openProcesses > 0
                  ? "Processos que ainda exigem acompanhamento, retorno ou conclusão dentro do Regularize."
                  : "Nenhum processo aberto no momento. Novas demandas passam a aparecer aqui quando entrarem no fluxo."
              }
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-1">
              <MetricTile
                icon={BadgeCheck}
                label="Licenças ativas"
                value={licenseQuery.isLoading ? "--" : metricData.activeLicenses}
              />
              <MetricTile
                icon={UserRound}
                label="PF ativos"
                value={pfQuery.isLoading ? "--" : metricData.activePfs}
              />
              <MetricTile
                icon={Landmark}
                label="Tributos pendentes"
                value={taxQuery.isLoading ? "--" : metricData.taxesPending}
                supporting={`${metricData.taxesDone}/${metricData.taxesTotal} criados em ${currentYear}`}
              />
              <MetricTile
                icon={ShieldCheck}
                label="Sites ativos"
                value={siteQuery.isLoading ? "--" : metricData.siteTotal}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:items-stretch">
            <DashboardSectionCard
              title="Processos recentes"
              description="Leitura rápida dos processos carregados no fluxo operacional."
              actionLabel="Ver processos"
              onAction={() => setActiveTab("processes")}
            >
              <QueryStatePanel query={processQuery} emptyTitle="Nenhum processo encontrado.">
                {(processRows) => (
                  <DataTable headers={["Processo", "Cliente", "Documento", "Status"]}>
                    {processRows.slice(0, 6).map((item) => (
                      <tr key={item.id} className="text-gray-700 dark:text-slate-200">
                        <td className="px-4 py-3 font-medium">{formatText(item.process_type)}</td>
                        <td className="px-4 py-3">{getProcessClientName(item)}</td>
                        <td className="px-4 py-3">{formatText(item.cpf_cnpj)}</td>
                        <td className="px-4 py-3">
                          <StatusBadge config={getStatusBadgeConfig(item.status)} size="sm" />
                        </td>
                      </tr>
                    ))}
                  </DataTable>
                )}
              </QueryStatePanel>
            </DashboardSectionCard>

            <DashboardSectionCard
              title="Licenças em acompanhamento"
              description="Protocolos ativos e vencimentos que precisam ficar visíveis."
              actionLabel="Ver licenças"
              onAction={() => setActiveTab("licenses")}
            >
              <QueryStatePanel query={licenseQuery} emptyTitle="Nenhuma licença encontrada.">
                {(licenseRows) => (
                  <DataTable headers={["Licença", "Protocolo", "Vencimento"]}>
                    {licenseRows.slice(0, 6).map((item) => (
                      <tr key={item.id} className="text-gray-700 dark:text-slate-200">
                        <td className="px-4 py-3 font-medium">{formatText(item.type_license)}</td>
                        <td className="px-4 py-3">{formatText(item.protocol)}</td>
                        <td className="px-4 py-3">{formatDate(item.due_date)}</td>
                      </tr>
                    ))}
                  </DataTable>
                )}
              </QueryStatePanel>
            </DashboardSectionCard>
          </div>
        </section>
      ) : null}

      {activeTab === "processes" ? (
        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.7fr)]">
          <QueryStatePanel query={processQuery} emptyTitle="Nenhum processo encontrado.">
            {(processRows) => (
              <DataTable headers={["Processo", "Cliente", "Documento", "Status", ""]}>
                {processRows.map((item) => (
                  <tr key={item.id} className="text-gray-700 dark:text-slate-200">
                    <td className="px-4 py-3 font-medium">{formatText(item.process_type)}</td>
                    <td className="px-4 py-3">{getProcessClientName(item)}</td>
                    <td className="px-4 py-3">{formatText(item.cpf_cnpj)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge config={getStatusBadgeConfig(item.status)} size="sm" />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedProcessId(item.id)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                        title="Ver detalhe"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </DataTable>
            )}
          </QueryStatePanel>

          <DetailPanel title="Processo selecionado">
            {processDetailQuery.isLoading ? (
              <FieldLine label="Status" value="Carregando..." />
            ) : processDetailQuery.data ? (
              <>
                <FieldLine label="Tipo" value={formatText(processDetailQuery.data.process_type)} />
                <FieldLine
                  label="Status"
                  value={<StatusBadge config={getStatusBadgeConfig(processDetailQuery.data.status)} size="sm" />}
                />
                <FieldLine label="Entrada" value={formatDate(processDetailQuery.data.entry_date)} />
                <FieldLine label="Previsto" value={formatDate(processDetailQuery.data.expected_date)} />
                <FieldLine label="Urgencia" value={formatText(processDetailQuery.data.urgency)} />
              </>
            ) : (
              <FieldLine label="Status" value="Sem seleção." />
            )}
            <div className="pt-2">
              <QueryStatePanel query={guidanceQuery} emptyTitle="Sem orientações.">
                {(guidanceRows) => (
                  <div className="space-y-2">
                    {guidanceRows.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-lg border border-gray-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900"
                      >
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {formatText(item.type, "Orientação")}
                        </p>
                        <p className="mt-1 line-clamp-2 text-sm text-gray-500 dark:text-slate-400">
                          {formatText(item.description, "Sem descrição.")}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </QueryStatePanel>
            </div>
          </DetailPanel>
        </section>
      ) : null}

      {activeTab === "licenses" ? (
        <section>
          <QueryStatePanel query={licenseQuery} emptyTitle="Nenhuma licença encontrada.">
            {(licenseRows) => (
              <DataTable headers={["Licença", "Protocolo", "Contato", "Status", "Vencimento"]}>
                {licenseRows.map((item) => (
                  <tr key={item.id} className="text-gray-700 dark:text-slate-200">
                    <td className="px-4 py-3 font-medium">{formatText(item.type_license)}</td>
                    <td className="px-4 py-3">{formatText(item.protocol)}</td>
                    <td className="px-4 py-3">{formatText(item.contact)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge config={getStatusBadgeConfig(item.status)} size="sm" />
                    </td>
                    <td className="px-4 py-3">{formatDate(item.due_date)}</td>
                  </tr>
                ))}
              </DataTable>
            )}
          </QueryStatePanel>
        </section>
      ) : null}

      {activeTab === "pf" ? (
        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
          <QueryStatePanel query={pfQuery} emptyTitle="Nenhum cliente PF encontrado.">
            {(pfRows) => (
              <DataTable headers={["Código", "Nome", "CPF", ""]}>
                {pfRows.map((item: RegularizeClientPfListItem) => (
                  <tr key={item.id} className="text-gray-700 dark:text-slate-200">
                    <td className="px-4 py-3">{formatText(item.code)}</td>
                    <td className="px-4 py-3 font-medium">{formatText(item.name)}</td>
                    <td className="px-4 py-3">{formatText(item.cpf)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedClientPfId(item.id)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                        title="Ver detalhe"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </DataTable>
            )}
          </QueryStatePanel>

          <DetailPanel title="Cliente PF selecionado">
            {clientPfDetailQuery.isLoading ? (
              <FieldLine label="Status" value="Carregando..." />
            ) : clientPfDetailQuery.data ? (
              <>
                <FieldLine label="Nome" value={formatText(clientPfDetailQuery.data.name)} />
                <FieldLine label="CPF" value={formatText(clientPfDetailQuery.data.cpf)} />
                <FieldLine label="Cidade" value={formatText(clientPfDetailQuery.data.city)} />
                <FieldLine label="UF" value={formatText(clientPfDetailQuery.data.state)} />
                <FieldLine label="Status" value={formatText(clientPfDetailQuery.data.status)} />
              </>
            ) : (
              <FieldLine label="Status" value="Sem seleção." />
            )}
          </DetailPanel>
        </section>
      ) : null}

      {activeTab === "partners" ? (
        <section>
          <QueryStatePanel query={partnerQuery} emptyTitle="Nenhum sócio encontrado.">
            {(partnerRows) => (
              <DataTable headers={["PF", "PJ", "Participação", "Entrada", "Saída"]}>
                {partnerRows.map((item: RegularizePartner) => (
                  <tr key={item.id} className="text-gray-700 dark:text-slate-200">
                    <td className="px-4 py-3 font-medium">{formatText(item.pf_id).slice(0, 8)}</td>
                    <td className="px-4 py-3">{formatText(item.pj_id).slice(0, 8)}</td>
                    <td className="px-4 py-3">{formatText(item.part)}</td>
                    <td className="px-4 py-3">{formatDate(item.entry)}</td>
                    <td className="px-4 py-3">{formatDate(item.exit)}</td>
                  </tr>
                ))}
              </DataTable>
            )}
          </QueryStatePanel>
        </section>
      ) : null}

      {activeTab === "passwords" ? (
        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
          <QueryStatePanel query={credentialQuery} emptyTitle="Nenhuma senha encontrada.">
            {(credentialRows) => (
              <DataTable headers={["Site", "Escopo", "Observação", "Senha", ""]}>
                {credentialRows.map((item: RegularizePasswordListItem) => (
                  <tr key={item.id} className="text-gray-700 dark:text-slate-200">
                    <td className="px-4 py-3 font-medium">{formatText(item.site?.name)}</td>
                    <td className="px-4 py-3">{formatText(item.site?.sphere)}</td>
                    <td className="px-4 py-3">{formatText(item.notes)}</td>
                    <td className="px-4 py-3"><MaskedValue /></td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        disabled={!canRevealCredentials}
                        onClick={() => setActivePasswordId(item.id)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                        title="Revelar senha"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </DataTable>
            )}
          </QueryStatePanel>

          <DetailPanel title="Senha selecionada">
            {passwordDetailQuery.isLoading ? (
              <FieldLine label="Status" value="Carregando..." />
            ) : passwordDetailQuery.isError ? (
              <FieldLine label="Status" value="Acesso negado ou indisponível." />
            ) : passwordDetailQuery.data ? (
              <>
                <FieldLine label="Login" value={formatText(passwordDetailQuery.data.login)} />
                <FieldLine label="Senha" value={formatText(passwordDetailQuery.data.password)} />
                <FieldLine label="Notas" value={formatText(passwordDetailQuery.data.notes)} />
              </>
            ) : (
              <FieldLine label="Status" value="Sem revelação ativa." />
            )}
          </DetailPanel>
        </section>
      ) : null}

      {activeTab === "sites" ? (
        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
          <QueryStatePanel query={siteQuery} emptyTitle="Nenhum site encontrado.">
            {(siteRows) => (
              <DataTable headers={["Site", "Escopo", "Usuário", "Status", ""]}>
                {siteRows.map((item: RegularizeSitePasswordListItem) => (
                  <tr key={item.id} className="text-gray-700 dark:text-slate-200">
                    <td className="px-4 py-3 font-medium">{formatText(item.name)}</td>
                    <td className="px-4 py-3">{formatText(item.sphere)}</td>
                    <td className="px-4 py-3">{formatText(item.user)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge config={getStatusBadgeConfig(item.status)} size="sm" />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        disabled={!canRevealCredentials}
                        onClick={() => setActiveSitePasswordId(item.id)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                        title="Revelar credencial"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </DataTable>
            )}
          </QueryStatePanel>

          <DetailPanel title="Site selecionado">
            {sitePasswordDetailQuery.isLoading ? (
              <FieldLine label="Status" value="Carregando..." />
            ) : sitePasswordDetailQuery.isError ? (
              <FieldLine label="Status" value="Acesso negado ou indisponível." />
            ) : sitePasswordDetailQuery.data ? (
              <>
                <FieldLine label="Usuário" value={formatText(sitePasswordDetailQuery.data.user)} />
                <FieldLine
                  label="Senha"
                  value={formatText(sitePasswordDetailQuery.data.password)}
                />
                <FieldLine label="Link" value={formatText(sitePasswordDetailQuery.data.link)} />
              </>
            ) : (
              <FieldLine label="Status" value="Sem revelação ativa." />
            )}
          </DetailPanel>
        </section>
      ) : null}

      {activeTab === "taxes" ? (
        <section>
          <QueryStatePanel query={taxQuery} emptyTitle="Nenhum tributo encontrado.">
            {(taxRows) => (
              <DataTable headers={["Cliente", "Documento", "Cidade", "Ano", "Registro"]}>
                {taxRows.map((item: RegularizeMunicipalTaxesClientSummary) => (
                  <tr key={item.id} className="text-gray-700 dark:text-slate-200">
                    <td className="px-4 py-3 font-medium">{formatText(item.name)}</td>
                    <td className="px-4 py-3">{formatText(item.cpf_cnpj)}</td>
                    <td className="px-4 py-3">
                      {item.city ? (
                        formatText(item.city)
                      ) : (
                        <span className="block text-center text-gray-500 dark:text-slate-400">
                          -
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">{currentYear}</td>
                    <td className="px-4 py-3">
                      <StatusBadge
                        config={
                          (item.municipalTaxes?.length ?? 0) > 0
                            ? { label: "Criado", variant: "success", icon: CheckCircle2 }
                            : { label: "Pendente", variant: "warning", icon: CalendarDays }
                        }
                        size="sm"
                      />
                    </td>
                  </tr>
                ))}
              </DataTable>
            )}
          </QueryStatePanel>
        </section>
      ) : null}
    </div>
  );
}
