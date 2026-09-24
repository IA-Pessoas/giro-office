import {
  Activity,
  AlertCircle,
  ArrowUp,
  BarChart3,
  Bell,
  Briefcase,
  Calendar,
  CheckSquare,
  Clock,
  DollarSign,
  FileText,
  Mail,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useActivityClock } from "../../../modules/dashboard/hooks/useActivityClock";
import { useDashboard } from "../../../modules/dashboard/hooks/useDashboard";
import type { DashboardStats } from "../../../modules/dashboard/types";
import { formatActivityTime } from "../../../modules/dashboard/utils/activityTime";

type DashboardProjectStats = DashboardStats["projects"];
type DashboardActivity = DashboardStats["activities"][number] & {
  bgColor: string;
  textColor: string;
  elapsedTime: string;
};

const ACTIVITY_TONE_CLASSES: Record<DashboardStats["activities"][number]["tone"], { bgColor: string; textColor: string }> = {
  green: {
    bgColor: "bg-green-100 dark:bg-green-900/30",
    textColor: "text-green-700 dark:text-green-300",
  },
  blue: {
    bgColor: "bg-blue-100 dark:bg-blue-900/30",
    textColor: "text-blue-700 dark:text-blue-300",
  },
  yellow: {
    bgColor: "bg-yellow-100 dark:bg-yellow-900/30",
    textColor: "text-yellow-700 dark:text-yellow-300",
  },
  purple: {
    bgColor: "bg-purple-100 dark:bg-purple-900/30",
    textColor: "text-purple-700 dark:text-purple-300",
  },
  indigo: {
    bgColor: "bg-indigo-100 dark:bg-indigo-900/30",
    textColor: "text-indigo-700 dark:text-indigo-300",
  },
};

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

function getPercent(value: number, total: number): number {
  if (total <= 0) {
    return 0;
  }

  return Math.round((value / total) * 100);
}

function buildProjectsData(projects: DashboardProjectStats) {
  return [
    { name: "Concluídos", value: projects.completed, color: "#10b981" },
    { name: "Em Andamento", value: projects.inProgress, color: "#3b82f6" },
    { name: "Atrasados", value: projects.delayed, color: "#ef4444" },
    { name: "Aguardando", value: projects.waiting, color: "#f59e0b" },
  ];
}

function getEmptyPerformanceData(): DashboardStats["performance"] {
  return ["Sem 1", "Sem 2", "Sem 3", "Sem 4"].map((week) => ({
    week,
    tasks: 0,
    completed: 0,
  }));
}

function getEmptyFinancialSummary(): DashboardStats["financial"] {
  return {
    paidCertificateReceipts: 0,
    unpaidCertificates: 0,
    monthlyPaidCertificateReceipts: [],
  };
}

function hasDashboardData(stats: DashboardStats): boolean {
  return Boolean(
    stats.totalClients > 0 ||
      stats.tasks.today > 0 ||
      stats.tasks.completedToday > 0 ||
      stats.tasks.pending > 0 ||
      stats.tasks.urgent > 0 ||
      stats.projects.active > 0 ||
      stats.projects.completed > 0 ||
      stats.projects.inProgress > 0 ||
      stats.projects.delayed > 0 ||
      stats.projects.waiting > 0 ||
      (stats.financial?.paidCertificateReceipts ?? 0) > 0 ||
      (stats.financial?.unpaidCertificates ?? 0) > 0 ||
      (stats.financial?.monthlyPaidCertificateReceipts ?? []).some((item) => item.amount > 0) ||
      (stats.commercial?.activeProspects ?? 0) > 0 ||
      (stats.commercial?.closedThisMonth ?? 0) > 0 ||
      (stats.commercial?.byStatus ?? []).some((item) => item.count > 0) ||
      (stats.commercial?.billing.pending ?? 0) > 0 ||
      (stats.commercial?.billing.contracted ?? 0) > 0 ||
      (stats.commercial?.billing.notContracted ?? 0) > 0 ||
      (stats.departments ?? []).some(
        (department) =>
          department.openTasks > 0 || department.completedTasks > 0 || department.urgentTasks > 0,
      ) ||
      stats.notifications.total > 0 ||
      stats.notifications.urgent > 0 ||
      stats.notifications.pending > 0 ||
      stats.performance.some((item) => item.tasks > 0 || item.completed > 0) ||
      stats.pendingTasks.length > 0 ||
      stats.recentClients.length > 0 ||
      stats.activities.length > 0,
  );
}

function DashboardStatePanel({
  title,
  description,
  action,
  role,
}: {
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
  role?: "alert" | "status";
}) {
  return (
    <section
      role={role}
      className="mx-auto flex min-h-[24rem] max-w-2xl items-center justify-center rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm dark:border-gray-700 dark:bg-gray-800"
    >
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{description}</p>
        {action ? (
          <button
            type="button"
            onClick={action.onClick}
            className="mt-5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            {action.label}
          </button>
        ) : null}
      </div>
    </section>
  );
}

function formatLastUpdated(updatedAt: string | null | undefined): string {
  if (!updatedAt) {
    return "Sem atualização";
  }

  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime()) || date.getTime() > Date.now()) {
    return "Sem atualização";
  }

  return `${date.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "short",
    year: "numeric",
  })} - ${date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

export function Dashboard() {
  const { stats, isLoading, isFetching, error, refetch } = useDashboard();
  const activityNow = useActivityClock();
  const lastUpdated = formatLastUpdated(stats?.updatedAt);

  if (isLoading && !stats) {
    return (
      <DashboardStatePanel
        role="status"
        title="Carregando dashboard"
        description="Buscando os indicadores reais da organização."
      />
    );
  }

  if (error && !stats) {
    return (
      <DashboardStatePanel
        role="alert"
        title="Não foi possível carregar o dashboard"
        description="Tente novamente para consultar os indicadores atuais."
        action={{ label: "Tentar novamente", onClick: () => void refetch() }}
      />
    );
  }

  if (!stats) {
    return (
      <DashboardStatePanel
        title="Nenhum dado disponível"
        description="Ainda não existem indicadores para esta organização."
      />
    );
  }

  if (!hasDashboardData(stats)) {
    return (
      <DashboardStatePanel
        title="Nenhum indicador disponível"
        description="Os módulos ainda não possuem dados suficientes para compor a visão gerencial."
      />
    );
  }

  const tasksSummary = stats?.tasks ?? {
    today: 0,
    completedToday: 0,
    pending: 0,
    urgent: 0,
  };
  const financialSummary = stats.financial ?? getEmptyFinancialSummary();
  const commercialSummary = stats.commercial ?? {
    activeProspects: 0,
    closedThisMonth: 0,
    byStatus: [],
    billing: { pending: 0, contracted: 0, notContracted: 0 },
  };
  const departmentSummary = stats.departments ?? [];
  const notificationSummary = stats?.notifications ?? {
    total: 0,
    urgent: 0,
    pending: 0,
  };
  const projectSummary = stats?.projects ?? {
    active: 0,
    completed: 0,
    inProgress: 0,
    delayed: 0,
    waiting: 0,
  };
  const taskCompletionPercent = getPercent(tasksSummary.completedToday, tasksSummary.today);
  const projectCompletionRate = getPercent(projectSummary.completed, projectSummary.completed + projectSummary.active);
  const tasks = stats?.pendingTasks ?? [];
  const receiptsData = financialSummary.monthlyPaidCertificateReceipts.map(({ month, amount }) => ({
    month,
    amount,
  }));
  const projectsData = buildProjectsData(projectSummary);
  const performanceData = stats?.performance ?? getEmptyPerformanceData();
  const activities: DashboardActivity[] = (stats?.activities ?? []).map((activity) => ({
    ...activity,
    elapsedTime: formatActivityTime(activity.createdAt, activityNow),
    ...(ACTIVITY_TONE_CLASSES[activity.tone] ?? ACTIVITY_TONE_CLASSES.blue),
  }));

  return (
    <div className="max-w-[1600px] mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-1">Dashboard</h1>
          <p className="text-gray-600 dark:text-gray-400">Visão geral do Office</p>
        </div>
        <div className="text-right">
          <p className="text-sm text-gray-600 dark:text-gray-400">Última atualização</p>
          <p className="text-sm font-semibold text-gray-900 dark:text-white">
            {lastUpdated}
          </p>
          {isFetching ? <p className="text-xs text-blue-600 dark:text-blue-400">Atualizando...</p> : null}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 hover:shadow-lg transition-all hover:-translate-y-1 cursor-pointer">
          <div className="mb-4 flex items-start justify-between gap-2">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <div className="h-[3.25rem] w-[3.25rem] shrink-0 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-md">
                <CheckSquare className="h-7 w-7 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-2xl font-bold leading-tight text-gray-900 dark:text-white">{tasksSummary.today}</p>
                <p className="text-xs text-gray-600 dark:text-gray-400">Tarefas Hoje</p>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <span className="text-xs font-medium text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-2 py-1 rounded-full flex items-center gap-1">
                <ArrowUp className="w-3 h-3" />
                {taskCompletionPercent}%
              </span>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400">
              <span>Concluídas: {tasksSummary.completedToday}</span>
              <span>{taskCompletionPercent}%</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                className="bg-gradient-to-r from-blue-500 to-blue-600 h-2 rounded-full transition-all"
                style={{ width: `${taskCompletionPercent}%` }}
              />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 hover:shadow-lg transition-all hover:-translate-y-1 cursor-pointer">
          <div className="mb-4 flex items-start gap-3">
            <div className="h-[3.25rem] w-[3.25rem] shrink-0 bg-gradient-to-br from-green-500 to-green-600 rounded-xl flex items-center justify-center shadow-md">
              <DollarSign className="h-7 w-7 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-bold leading-tight whitespace-nowrap text-gray-900 dark:text-white">
                {formatCurrency(financialSummary.paidCertificateReceipts)}
              </p>
              <p className="text-xs text-gray-600 dark:text-gray-400">Recebimentos no mês</p>
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Certificados sem pagamento: {financialSummary.unpaidCertificates}
            </p>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 hover:shadow-lg transition-all hover:-translate-y-1 cursor-pointer">
          <div className="mb-4 flex items-start justify-between gap-2">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <div className="relative h-[3.25rem] w-[3.25rem] shrink-0 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center shadow-md">
                <Bell className="h-7 w-7 text-white" />
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] text-white">
                  {notificationSummary.urgent}
                </span>
              </div>
              <div className="min-w-0">
                <p className="text-2xl font-bold leading-tight text-gray-900 dark:text-white">{notificationSummary.total}</p>
                <p className="text-xs text-gray-600 dark:text-gray-400">Notificações</p>
              </div>
            </div>
            <AlertCircle className="h-6 w-6 shrink-0 text-purple-500 dark:text-purple-400" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs">
              <div className="w-2 h-2 bg-red-500 rounded-full" />
              <span className="text-gray-700 dark:text-gray-300">{notificationSummary.urgent} urgentes</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <div className="w-2 h-2 bg-yellow-500 rounded-full" />
              <span className="text-gray-700 dark:text-gray-300">{notificationSummary.pending} pendentes</span>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 hover:shadow-lg transition-all hover:-translate-y-1 cursor-pointer">
          <div className="mb-4 flex items-start justify-between gap-2">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <div className="h-[3.25rem] w-[3.25rem] shrink-0 bg-gradient-to-br from-cyan-500 to-cyan-600 rounded-xl flex items-center justify-center shadow-md">
                <Target className="h-7 w-7 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-2xl font-bold leading-tight text-gray-900 dark:text-white">{projectSummary.active}</p>
                <p className="text-xs text-gray-600 dark:text-gray-400">Projetos Ativos</p>
              </div>
            </div>
            <Calendar className="h-6 w-6 shrink-0 text-cyan-500 dark:text-cyan-400" />
          </div>
          <div className="space-y-1">
            <p className="text-xs text-gray-600 dark:text-gray-400">Taxa de conclusão:</p>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">{projectCompletionRate}%</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                Recebimentos de certificados
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Valores pagos nos últimos 7 meses
              </p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={receiptsData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.1} />
              <XAxis dataKey="month" stroke="#9ca3af" style={{ fontSize: "12px" }} />
              <YAxis stroke="#9ca3af" style={{ fontSize: "12px" }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#1f2937",
                  border: "none",
                  borderRadius: "8px",
                  color: "#fff",
                }}
              />
              <Area
                type="monotone"
                dataKey="amount"
                stackId="1"
                name="Recebimentos pagos"
                stroke="#10b981"
                fill="#10b981"
                fillOpacity={0.6}
                // Sem animação de entrada nos gráficos: ela parte do zero, e a 1ª carga parecia zerada (#1384).
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                Status dos Projetos
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Distribuição atual</p>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <ResponsiveContainer width="50%" height={200}>
              <PieChart>
                <Pie
                  data={projectsData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                  isAnimationActive={false}
                >
                  {projectsData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-2">
              {projectsData.map((item, index) => (
                <div key={index} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="text-sm text-gray-700 dark:text-gray-300">{item.name}</span>
                  </div>
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <section className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800" aria-labelledby="dashboard-commercial-title">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 id="dashboard-commercial-title" className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
                <Target className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                Pipeline comercial
              </h2>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                Prospecções e cobranças registradas no Comercial.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-purple-50 p-3 dark:bg-purple-900/20">
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{commercialSummary.activeProspects}</p>
              <p className="text-xs text-gray-600 dark:text-gray-400">Prospecções ativas</p>
            </div>
            <div className="rounded-lg bg-green-50 p-3 dark:bg-green-900/20">
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{commercialSummary.closedThisMonth}</p>
              <p className="text-xs text-gray-600 dark:text-gray-400">Fechadas no mês</p>
            </div>
            <div className="rounded-lg bg-orange-50 p-3 dark:bg-orange-900/20">
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{commercialSummary.billing.pending}</p>
              <p className="text-xs text-gray-600 dark:text-gray-400">Cobranças a realizar</p>
            </div>
          </div>
          <div className="mt-5 space-y-2">
            {commercialSummary.byStatus.filter((item) => item.count > 0).length > 0 ? (
              commercialSummary.byStatus.filter((item) => item.count > 0).map((item) => (
                <div key={item.status} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700 dark:text-gray-300">{item.status}</span>
                  <span className="font-semibold text-gray-900 dark:text-white">{item.count}</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">Nenhuma prospecção classificada.</p>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800" aria-labelledby="dashboard-departments-title">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 id="dashboard-departments-title" className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
                <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                Indicadores por departamento
              </h2>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                Tarefas abertas, concluídas e urgentes por departamento.
              </p>
            </div>
          </div>
          {departmentSummary.length > 0 ? (
            <div className="space-y-3">
              {departmentSummary.map((department) => (
                <div key={department.id} className="rounded-lg border border-gray-100 p-3 dark:border-gray-700">
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-sm font-semibold text-gray-900 dark:text-white">{department.name}</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">{department.openTasks} abertas</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-600 dark:text-gray-400">
                    <span>Concluídas: {department.completedTasks}</span>
                    <span>Urgentes: {department.urgentTasks}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">Nenhum departamento com dados de tarefas.</p>
          )}
        </section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-green-600 dark:text-green-400" />
              Performance Semanal
            </h3>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={performanceData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.1} />
              <XAxis dataKey="week" stroke="#9ca3af" style={{ fontSize: "12px" }} />
              <YAxis stroke="#9ca3af" style={{ fontSize: "12px" }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#1f2937",
                  border: "none",
                  borderRadius: "8px",
                  color: "#fff",
                }}
              />
              <Bar dataKey="tasks" fill="#3b82f6" radius={[4, 4, 0, 0]} isAnimationActive={false} />
              <Bar dataKey="completed" fill="#10b981" radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <CheckSquare className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              Tarefas Pendentes
            </h3>
            <button className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium">
              Ver todas
            </button>
          </div>
          <div className="space-y-3">
            {tasks.map((task, i) => (
              <div
                key={i}
                className="flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg transition-colors cursor-pointer border border-transparent hover:border-gray-200 dark:hover:border-gray-600"
              >
                <div className="flex items-center gap-3 flex-1">
                  <input
                    type="checkbox"
                    className="w-4 h-4 text-blue-600 border-2 border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{task.title}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          task.priority === "Alta"
                            ? "bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300"
                            : task.priority === "Média"
                              ? "bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300"
                              : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                        }`}
                      >
                        {task.priority}
                      </span>
                      <span className="text-xs text-gray-600 dark:text-gray-400 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {task.dueDate}
                      </span>
                    </div>
                  </div>
                </div>
                {task.status === "urgent" ? (
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Activity className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              Atividade Recente
            </h3>
            <button className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium">
              Ver todas
            </button>
          </div>
          <div className="space-y-4">
            {activities.length > 0 ? (
              activities.map((activity, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 p-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg transition-colors cursor-pointer"
                >
                  <div
                    className={`w-8 h-8 rounded-full ${activity.bgColor} flex items-center justify-center flex-shrink-0`}
                  >
                    <span className={`text-xs font-semibold ${activity.textColor}`}>
                      {activity.avatar}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900 dark:text-white">
                      <span className="font-medium">{activity.user}</span> {activity.action}{" "}
                      <span className="font-medium">{activity.item}</span>
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {activity.elapsedTime}
                    </p>
                  </div>
                </div>
              ))
            ) : isLoading ? (
              <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                Carregando atividades...
              </p>
            ) : error && !stats ? (
              <div
                role="alert"
                className="rounded-lg bg-red-50 p-4 text-center dark:bg-red-900/20"
              >
                <p className="text-sm text-red-700 dark:text-red-300">
                  Não foi possível carregar as atividades agora.
                </p>
                <button
                  type="button"
                  onClick={() => void refetch()}
                  className="mt-3 text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  Tentar novamente
                </button>
              </div>
            ) : (
              <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                Nenhuma atividade recente.
              </p>
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">Ações Rápidas</h3>
          <div className="grid grid-cols-2 gap-3">
            <button className="flex flex-col items-center justify-center p-4 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg transition-all hover:scale-105 group border border-transparent hover:border-blue-200 dark:hover:border-blue-700">
              <CheckSquare className="h-7 w-7 text-blue-600 dark:text-blue-400 mb-2 group-hover:scale-110 transition-transform" />
              <span className="text-sm font-medium text-gray-900 dark:text-white">Nova Tarefa</span>
            </button>

            <button className="flex flex-col items-center justify-center p-4 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/30 rounded-lg transition-all hover:scale-105 group border border-transparent hover:border-green-200 dark:hover:border-green-700">
              <Users className="h-7 w-7 text-green-600 dark:text-green-400 mb-2 group-hover:scale-110 transition-transform" />
              <span className="text-sm font-medium text-gray-900 dark:text-white">Novo Cliente</span>
            </button>

            <button className="flex flex-col items-center justify-center p-4 bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/30 rounded-lg transition-all hover:scale-105 group border border-transparent hover:border-purple-200 dark:hover:border-purple-700">
              <Briefcase className="h-7 w-7 text-purple-600 dark:text-purple-400 mb-2 group-hover:scale-110 transition-transform" />
              <span className="text-sm font-medium text-gray-900 dark:text-white">Novo Projeto</span>
            </button>

            <button className="flex flex-col items-center justify-center p-4 bg-cyan-50 dark:bg-cyan-900/20 hover:bg-cyan-100 dark:hover:bg-cyan-900/30 rounded-lg transition-all hover:scale-105 group border border-transparent hover:border-cyan-200 dark:hover:border-cyan-700">
              <Mail className="h-7 w-7 text-cyan-600 dark:text-cyan-400 mb-2 group-hover:scale-110 transition-transform" />
              <span className="text-sm font-medium text-gray-900 dark:text-white">Enviar Email</span>
            </button>

            <button className="flex flex-col items-center justify-center p-4 bg-orange-50 dark:bg-orange-900/20 hover:bg-orange-100 dark:hover:bg-orange-900/30 rounded-lg transition-all hover:scale-105 group border border-transparent hover:border-orange-200 dark:hover:border-orange-700">
              <FileText className="h-7 w-7 text-orange-600 dark:text-orange-400 mb-2 group-hover:scale-110 transition-transform" />
              <span className="text-sm font-medium text-gray-900 dark:text-white">Novo Documento</span>
            </button>

            <button className="flex flex-col items-center justify-center p-4 bg-indigo-50 dark:bg-indigo-900/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 rounded-lg transition-all hover:scale-105 group border border-transparent hover:border-indigo-200 dark:hover:border-indigo-700">
              <Calendar className="h-7 w-7 text-indigo-600 dark:text-indigo-400 mb-2 group-hover:scale-110 transition-transform" />
              <span className="text-sm font-medium text-gray-900 dark:text-white">Agendar Reunião</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
