import { useMemo, type ReactNode } from "react";
import {
  ArrowRight,
  Bell,
  ClipboardCheck,
  FileSignature,
  Loader2,
  TrendingUp,
} from "lucide-react";

import { useRhTimeSheets } from "../hooks/useRhCalendar";
import { useRhRequests } from "../hooks/useRhRequests";
import { useRhPendingScoreEvaluations } from "../hooks/useRhScore";
import type { RhRequest } from "../types";
import { formatRhDateTime } from "../utils/rhDate";
import {
  getRhRequestStatusClassName,
  getRhRequestStatusLabel,
  getRhRequestUrgencyClassName,
  getRhRequestUrgencyLabel,
} from "../utils/rhRequestUi";

type RhDashboardTab = "requests" | "point" | "evaluations";

interface RhDashboardSectionProps {
  isActive: boolean;
  onNavigateToTab: (tab: RhDashboardTab) => void;
}

function sortRequestsByUpdatedAt(requests: RhRequest[]) {
  return [...requests].sort(
    (left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime(),
  );
}

function SectionCard({
  title,
  description,
  actionLabel,
  onAction,
  children,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{description}</p>
        </div>
        {actionLabel && onAction ? (
          <button
            type="button"
            onClick={onAction}
            className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 transition-colors hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
          >
            <span>{actionLabel}</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function StateBox({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "danger";
  children: ReactNode;
}) {
  const className =
    tone === "danger"
      ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-900/10 dark:text-red-300"
      : "border-dashed border-gray-200 text-gray-600 dark:border-gray-700 dark:text-gray-400";

  return <div className={`rounded-xl border p-4 text-sm ${className}`}>{children}</div>;
}

function HeroMetricCard({
  label,
  value,
  description,
  icon: Icon,
  tone = "highlight",
}: {
  label: string;
  value: string | number;
  description: string;
  icon: typeof Bell;
  tone?: "highlight" | "calm";
}) {
  const containerClassName =
    tone === "calm"
      ? "bg-[linear-gradient(135deg,#f8fafc_0%,#eef2ff_48%,#eff6ff_100%)] text-gray-900 dark:bg-[linear-gradient(135deg,#111827_0%,#1f2937_48%,#172554_100%)] dark:text-white"
      : "bg-[linear-gradient(135deg,#1d4ed8_0%,#2563eb_48%,#7c3aed_100%)] text-white";
  const orbClassName = tone === "calm" ? "bg-blue-500/10 dark:bg-white/10" : "bg-white/10";
  const labelClassName = tone === "calm" ? "text-gray-600 dark:text-white/80" : "text-white/85";
  const descriptionClassName =
    tone === "calm" ? "text-gray-600 dark:text-white/75" : "text-white/75";
  const iconWrapperClassName =
    tone === "calm"
      ? "bg-blue-500/10 text-blue-700 dark:bg-white/15 dark:text-white"
      : "bg-white/15 text-white";

  return (
    <div className={`relative overflow-hidden rounded-[20px] p-4.5 sm:p-5 shadow-sm ${containerClassName}`}>
      <div
        className={`absolute right-0 top-0 h-16 w-16 translate-x-4 -translate-y-4 rounded-full blur-xl ${orbClassName}`}
      />
      <div className="relative flex items-start justify-between gap-4">
        <div>
          <p className={`text-sm font-semibold uppercase tracking-[0.08em] ${labelClassName}`}>
            {label}
          </p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
          <p className={`mt-1 max-w-[18rem] text-xs leading-5 ${descriptionClassName}`}>
            {description}
          </p>
        </div>
        <div className={`mt-0.5 mr-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl backdrop-blur-sm ${iconWrapperClassName}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Bell;
  label: string;
  value: string | number;
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
        <p className="pl-12 text-[1.4rem] font-semibold tracking-tight text-gray-900 dark:text-white">{value}</p>
      </div>
    </div>
  );
}

function SummaryTile({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-3.5 dark:border-gray-700 dark:bg-gray-900/20">
      <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">{value}</p>
    </div>
  );
}

export function RhDashboardSection({
  isActive,
  onNavigateToTab,
}: RhDashboardSectionProps) {
  const requestsQuery = useRhRequests({}, { enabled: isActive });
  const pendingEvaluationsQuery = useRhPendingScoreEvaluations({ enabled: isActive });
  const timeSheetsQuery = useRhTimeSheets({}, { enabled: isActive });

  const requests = requestsQuery.data ?? [];
  const recentRequests = useMemo(() => sortRequestsByUpdatedAt(requests).slice(0, 4), [requests]);
  const pendingRequestsCount = requests.filter(
    (request) => request.status === "New" || request.status === "In_Progress",
  ).length;
  const resolvedRequestsCount = requests.filter(
    (request) => request.status === "Resolved" || request.status === "Closed",
  ).length;
  const pendingEvaluationsCount = pendingEvaluationsQuery.data?.length ?? 0;
  const unsignedTimeSheetsCount =
    timeSheetsQuery.data?.filter((sheet) => !sheet.signature).length ?? 0;
  const totalTimeSheetsCount = timeSheetsQuery.data?.length ?? 0;
  const hasSecondaryDashboardError = Boolean(
    pendingEvaluationsQuery.error || timeSheetsQuery.error,
  );
  const hasPendingRequests = pendingRequestsCount > 0;
  const totalPendingActions =
    pendingRequestsCount + pendingEvaluationsCount + unsignedTimeSheetsCount;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)] xl:items-stretch">
        <HeroMetricCard
          icon={Bell}
          label={hasPendingRequests ? "Solicitações pendentes" : "Fluxo principal em dia"}
          value={requestsQuery.isLoading ? "--" : pendingRequestsCount}
          description={
            hasPendingRequests
              ? "Demandas do RH que ainda precisam de retorno ou acompanhamento."
              : "Nenhuma solicitação aberta no momento. Novas demandas da área aparecerão aqui quando exigirem atenção."
          }
          tone={hasPendingRequests ? "highlight" : "calm"}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 xl:grid-cols-1">
          <MetricCard
            icon={TrendingUp}
            label="Solicitações resolvidas"
            value={requestsQuery.isLoading ? "--" : resolvedRequestsCount}
          />
          <MetricCard
            icon={ClipboardCheck}
            label="Avaliações pendentes"
            value={pendingEvaluationsQuery.isLoading ? "--" : pendingEvaluationsCount}
          />
          <MetricCard
            icon={FileSignature}
            label="Folhas sem assinatura"
            value={timeSheetsQuery.isLoading ? "--" : unsignedTimeSheetsCount}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.2fr,0.8fr]">
        <SectionCard
          title="Solicitações recentes"
          description="Últimas movimentações e pendências do atendimento interno."
          actionLabel="Ver todas"
          onAction={() => onNavigateToTab("requests")}
        >
          {requestsQuery.isLoading ? (
            <StateBox>
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Carregando solicitações...</span>
              </div>
            </StateBox>
          ) : requestsQuery.error ? (
            <StateBox tone="danger">Não foi possível carregar as solicitações do RH.</StateBox>
          ) : recentRequests.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/80 p-5 dark:border-gray-700 dark:bg-gray-900/20">
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                Nenhuma solicitação recente por aqui
              </p>
              <p className="mt-2 max-w-xl text-sm leading-6 text-gray-600 dark:text-gray-400">
                Quando houver novas movimentações, retornos ou pendências do atendimento
                interno, elas aparecerão neste painel para facilitar o acompanhamento.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentRequests.map((request) => (
                <div
                  key={request.id}
                  className="rounded-xl border border-gray-100 p-3.5 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700/40"
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-900 dark:text-white">{request.title}</p>
                      <p className="mt-1 line-clamp-2 text-sm text-gray-600 dark:text-gray-400">
                        {request.description}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">
                      {formatRhDateTime(request.updated_at)}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${getRhRequestUrgencyClassName(request.urgency)}`}
                    >
                      {getRhRequestUrgencyLabel(request.urgency)}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${getRhRequestStatusClassName(request.status)}`}
                    >
                      {getRhRequestStatusLabel(request.status)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Pendências do RH"
          description="Leitura rápida dos itens que ainda pedem ação da área."
        >
          {pendingEvaluationsQuery.isLoading || timeSheetsQuery.isLoading ? (
            <StateBox>
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Carregando pendências gerenciais...</span>
              </div>
            </StateBox>
          ) : (
            <div className="space-y-3.5">
              {hasSecondaryDashboardError ? (
                <StateBox tone="danger">
                  Parte do resumo gerencial não pôde ser carregada. Os dados principais abaixo permanecem disponíveis.
                </StateBox>
              ) : null}
              <div className="rounded-2xl border border-gray-100 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-gray-900/20">
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">
                  Ação imediata
                </p>
                <div className="mt-2.5 flex items-end justify-between gap-4">
                  <div>
                    <p className="text-3xl font-semibold tracking-tight text-gray-900 dark:text-white">
                      {totalPendingActions}
                    </p>
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                      {totalPendingActions > 0
                        ? "itens ainda aguardam acompanhamento da área."
                        : "nenhum item pendente no momento."}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <SummaryTile label="Solicitações abertas" value={pendingRequestsCount} />
                <SummaryTile label="Avaliações pendentes" value={pendingEvaluationsCount} />
                <SummaryTile label="Folhas pendentes" value={unsignedTimeSheetsCount} />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-3.5 dark:border-gray-700 dark:bg-gray-900/20">
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    Solicitações concluídas
                  </p>
                  <p className="mt-2 text-lg font-semibold text-gray-900 dark:text-white">
                    {resolvedRequestsCount}
                  </p>
                </div>

                <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-3.5 dark:border-gray-700 dark:bg-gray-900/20">
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    Folhas no período
                  </p>
                  <p className="mt-2 text-lg font-semibold text-gray-900 dark:text-white">
                    {totalTimeSheetsCount}
                  </p>
                </div>
              </div>
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
