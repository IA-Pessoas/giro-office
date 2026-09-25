import {
  error as logError,
  parseDatabasePoolConnectionTimeoutMs,
  parseDatabasePoolMax,
  ServiceError,
} from "@workspace/shared";
import pg from "pg";

import { describeActivity } from "../audit/activityCatalog.js";

const { Pool } = pg;

type Queryable = Pick<pg.Pool, "query">;
const DASHBOARD_MAX_CONCURRENT_QUERIES = 2;

export interface DashboardFinancialSummary {
  paidCertificateReceipts: number;
  unpaidCertificates: number;
  monthlyPaidCertificateReceipts: Array<{
    month: string;
    amount: number;
  }>;
}

export interface DashboardCommercialSummary {
  activeProspects: number;
  closedThisMonth: number;
  byStatus: Array<{
    status: string;
    count: number;
  }>;
  billing: {
    pending: number;
    contracted: number;
    notContracted: number;
  };
}

export interface DashboardDepartmentSummary {
  id: string;
  name: string;
  openTasks: number;
  completedTasks: number;
  urgentTasks: number;
}

export interface DashboardStats {
  updatedAt: string | null;
  totalClients: number;
  clientsByService: {
    contabil: number;
    fiscal: number;
    pessoal: number;
    infoproduto: number;
    consultoria: number;
    castelo_med: number;
  };
  monthlyTrends: Array<{
    month: string;
    newClients: number;
  }>;
  financial: DashboardFinancialSummary;
  commercial: DashboardCommercialSummary;
  departments: DashboardDepartmentSummary[];
  recentClients: Array<{
    id: string;
    name: string;
    status: string;
    segmento: string;
    entryDate: string;
  }>;
  insights: Array<{
    type: "info" | "warning" | "success";
    title: string;
    description: string;
  }>;
  tasks: {
    today: number;
    completedToday: number;
    pending: number;
    urgent: number;
  };
  notifications: {
    total: number;
    urgent: number;
    pending: number;
  };
  projects: {
    active: number;
    completed: number;
    inProgress: number;
    delayed: number;
    waiting: number;
  };
  performance: Array<{
    week: string;
    tasks: number;
    completed: number;
  }>;
  pendingTasks: Array<{
    title: string;
    priority: "Alta" | "Média" | "Baixa";
    dueDate: string;
    status: "pending" | "urgent";
  }>;
  activities: Array<{
    user: string;
    action: string;
    item: string;
    createdAt: string | null;
    avatar: string;
    tone: "green" | "blue" | "yellow" | "purple" | "indigo";
  }>;
}

export interface DashboardStatsServiceOptions {
  databaseUrl?: string;
  pool?: Queryable;
  maxConcurrentQueries?: number;
}

interface ClientSummaryRow {
  active_total: number | string | null;
  contabil: number | string | null;
  fiscal: number | string | null;
  pessoal: number | string | null;
  infoproduto: number | string | null;
  consultoria: number | string | null;
  castelo_med: number | string | null;
}

interface MonthlyClientRow {
  month: string;
  new_clients: number | string | null;
}

interface RecentClientRow {
  id: string;
  name: string | null;
  status: string | null;
  segment: string | null;
  entry_date: Date | string | null;
}

interface TaskSummaryRow {
  today: number | string | null;
  completed_today: number | string | null;
  pending: number | string | null;
  urgent: number | string | null;
}

interface PendingTaskRow {
  title: string | null;
  urgency: string | null;
  prevision_date: Date | string | null;
  is_urgent: boolean | null;
}

interface ProjectSummaryRow {
  active: number | string | null;
  completed: number | string | null;
  in_progress: number | string | null;
  delayed: number | string | null;
  waiting: number | string | null;
}

interface NotificationSummaryRow {
  total: number | string | null;
  pending: number | string | null;
}

interface PerformanceRow {
  week: string;
  tasks: number | string | null;
  completed: number | string | null;
}

interface ActivityRow {
  user_name: string | null;
  action: string | null;
  method: string | null;
  item: string | null;
  path: string | null;
  created_at: Date | string | null;
  outcome: string | null;
  activity_visible: boolean | null;
}

interface UpdatedAtRow {
  updated_at: Date | string | null;
}

interface CertificateReceiptRow {
  month: string;
  paid_amount: number | string | null;
  unpaid_certificates: number | string | null;
}

interface CommercialSummaryRow {
  active_prospects: number | string | null;
  closed_this_month: number | string | null;
  financial_analysis: number | string | null;
  scheduling: number | string | null;
  proposal: number | string | null;
  paused: number | string | null;
  refused: number | string | null;
  closed: number | string | null;
}

interface CommercialBillingSummaryRow {
  pending: number | string | null;
  contracted: number | string | null;
  not_contracted: number | string | null;
}

interface DepartmentSummaryRow {
  id: string;
  name: string;
  open_tasks: number | string | null;
  completed_tasks: number | string | null;
  urgent_tasks: number | string | null;
}

const MONTH_LABELS = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
];
const COMPLETED_TASK_STATUSES = ["concluida", "concluido", "concluída", "concluído", "fechado"];
const INACTIVE_PROJECT_STATUSES = [
  "fechado",
  "inativo",
  "distrato",
  "recusado pelo cliente",
  "rejeitado pela castelo",
  "não contratado",
  "nao contratado",
];
const ACTIVITY_TONES: DashboardStats["activities"][number]["tone"][] = [
  "green",
  "blue",
  "yellow",
  "purple",
  "indigo",
];

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function formatIsoDate(value: Date | string | null): string {
  if (!value) {
    return new Date(0).toISOString();
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

function formatNullableIsoDate(value: Date | string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function formatDueDate(value: Date | string | null): string {
  if (!value) {
    return "Sem prazo";
  }

  const dueDate = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(dueDate.getTime())) {
    return "Sem prazo";
  }

  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);

  if (dueDate.toDateString() === today.toDateString()) {
    return "Hoje";
  }

  if (dueDate.toDateString() === tomorrow.toDateString()) {
    return "Amanhã";
  }

  return dueDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function getPriority(urgency: string | null): "Alta" | "Média" | "Baixa" {
  const normalized =
    urgency
      ?.normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase() ?? "";

  if (["alta", "alto", "urgente", "critica", "critico"].some((term) => normalized.includes(term))) {
    return "Alta";
  }

  if (["media", "medio"].some((term) => normalized.includes(term))) {
    return "Média";
  }

  return "Baixa";
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "US"
  );
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabelFromKey(value: string): string {
  const [, month] = value.split("-");
  const monthIndex = Number(month) - 1;
  return MONTH_LABELS[monthIndex] ?? value;
}

function fillMonthlyClientTrends(rows: MonthlyClientRow[]): DashboardStats["monthlyTrends"] {
  const byMonth = new Map(rows.map((row) => [row.month, toNumber(row.new_clients)]));
  const current = new Date();

  return Array.from({ length: 6 }, (_, index) => {
    const date = new Date(current.getFullYear(), current.getMonth() - (5 - index), 1);
    return {
      month: MONTH_LABELS[date.getMonth()] ?? "",
      newClients: byMonth.get(monthKey(date)) ?? 0,
    };
  });
}

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const DASHBOARD_ACTIVITY_LIMIT = 5;

function isEligibleActivity(activity: ActivityRow): boolean {
  // Leituras (GET) não são atividade de negócio: "acessou /user/me" poluía o feed (#1371).
  if (READ_METHODS.has((activity.method ?? "").toUpperCase())) return false;
  if (activity.activity_visible == null) return true;
  return activity.activity_visible && activity.outcome === "success";
}

/**
 * Rótulo humano da atividade. Linhas legadas sem `action`/`referring` são descritas pelo
 * catálogo de auditoria a partir de método + rota; sem descrição conhecida (ou se o item
 * ainda for uma rota de API), a linha sai do feed em vez de mostrar o caminho cru.
 */
function describeActivityRow(row: ActivityRow): { action: string; item: string } | null {
  const catalog = row.method && row.path ? describeActivity(row.method, row.path) : null;
  const action = row.action ?? catalog?.action;
  const item = row.item ?? catalog?.item;
  if (!action || !item || item.startsWith("/")) return null;
  return { action, item };
}

class DashboardQueryQueue {
  private activeTasks = 0;
  private readonly pendingTasks: Array<() => void> = [];

  constructor(private readonly concurrency: number) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    await this.acquire();

    try {
      return await task();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.activeTasks < this.concurrency) {
      this.activeTasks += 1;
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      this.pendingTasks.push(() => {
        this.activeTasks += 1;
        resolve();
      });
    });
  }

  private release(): void {
    this.activeTasks -= 1;
    this.pendingTasks.shift()?.();
  }
}

export class DashboardStatsService {
  private readonly databaseUrl?: string;
  private readonly injectedPool?: Queryable;
  private readonly queryQueue: DashboardQueryQueue;
  private readonly inFlightStats = new Map<string, Promise<DashboardStats>>();
  private pool?: pg.Pool;

  constructor(options: DashboardStatsServiceOptions) {
    this.databaseUrl = options.databaseUrl;
    this.injectedPool = options.pool;
    this.queryQueue = new DashboardQueryQueue(
      Math.max(1, Math.floor(options.maxConcurrentQueries ?? DASHBOARD_MAX_CONCURRENT_QUERIES)),
    );
  }

  async getStats(organizationId: string): Promise<DashboardStats> {
    if (!organizationId) {
      throw new ServiceError(400, "Organização autenticada não informada.");
    }

    const currentLoad = this.inFlightStats.get(organizationId);
    if (currentLoad) {
      return currentLoad;
    }

    const load = this.loadStats(organizationId);
    const trackedLoad = load.finally(() => {
      if (this.inFlightStats.get(organizationId) === trackedLoad) {
        this.inFlightStats.delete(organizationId);
      }
    });

    this.inFlightStats.set(organizationId, trackedLoad);
    return trackedLoad;
  }

  private async loadStats(organizationId: string): Promise<DashboardStats> {
    try {
      const pool = this.getPool();
      const query = <Row extends pg.QueryResultRow>(sql: string): Promise<pg.QueryResult<Row>> =>
        this.queryQueue.run(() => pool.query<Row>(sql, [organizationId]));
      const [
        clientSummaryResult,
        monthlyClientsResult,
        recentClientsResult,
        taskSummaryResult,
        pendingTasksResult,
        projectSummaryResult,
        notificationsResult,
        certificateReceiptsResult,
        commercialSummaryResult,
        commercialBillingResult,
        departmentSummaryResult,
        performanceResult,
        activitiesResult,
        updatedAtResult,
      ] = await Promise.all([
        query<ClientSummaryRow>(CLIENT_SUMMARY_SQL),
        query<MonthlyClientRow>(MONTHLY_CLIENTS_SQL),
        query<RecentClientRow>(RECENT_CLIENTS_SQL),
        query<TaskSummaryRow>(TASK_SUMMARY_SQL),
        query<PendingTaskRow>(PENDING_TASKS_SQL),
        query<ProjectSummaryRow>(PROJECT_SUMMARY_SQL),
        query<NotificationSummaryRow>(NOTIFICATION_SUMMARY_SQL),
        query<CertificateReceiptRow>(CERTIFICATE_RECEIPTS_SQL),
        query<CommercialSummaryRow>(COMMERCIAL_SUMMARY_SQL),
        query<CommercialBillingSummaryRow>(COMMERCIAL_BILLING_SUMMARY_SQL),
        query<DepartmentSummaryRow>(DEPARTMENT_SUMMARY_SQL),
        query<PerformanceRow>(PERFORMANCE_SQL),
        query<ActivityRow>(ACTIVITIES_SQL),
        query<UpdatedAtRow>(UPDATED_AT_SQL),
      ]);

      const clientSummary = clientSummaryResult.rows[0];
      const taskSummary = taskSummaryResult.rows[0];
      const projectSummary = projectSummaryResult.rows[0];
      const notifications = notificationsResult.rows[0];
      const certificateReceipts = certificateReceiptsResult.rows;
      const commercialSummary = commercialSummaryResult.rows[0];
      const commercialBilling = commercialBillingResult.rows[0];
      const monthlyTrends = fillMonthlyClientTrends(monthlyClientsResult.rows);
      const totalClients = toNumber(clientSummary?.active_total);
      const pendingTasks = toNumber(taskSummary?.pending);
      const completedProjects = toNumber(projectSummary?.completed);
      const activeProjects = toNumber(projectSummary?.active);
      const updatedAt = formatNullableIsoDate(updatedAtResult.rows[0]?.updated_at);
      const currentMonth = monthKey(new Date());
      const monthlyPaidCertificateReceipts = certificateReceipts.map((row) => ({
        month: monthLabelFromKey(row.month),
        amount: toNumber(row.paid_amount),
      }));
      const paidCertificateReceipts =
        certificateReceipts.find((row) => row.month === currentMonth)?.paid_amount ?? 0;

      return {
        updatedAt,
        totalClients,
        clientsByService: {
          contabil: toNumber(clientSummary?.contabil),
          fiscal: toNumber(clientSummary?.fiscal),
          pessoal: toNumber(clientSummary?.pessoal),
          infoproduto: toNumber(clientSummary?.infoproduto),
          consultoria: toNumber(clientSummary?.consultoria),
          castelo_med: toNumber(clientSummary?.castelo_med),
        },
        monthlyTrends,
        financial: {
          paidCertificateReceipts: toNumber(paidCertificateReceipts),
          unpaidCertificates: toNumber(certificateReceipts[0]?.unpaid_certificates),
          monthlyPaidCertificateReceipts,
        },
        commercial: {
          activeProspects: toNumber(commercialSummary?.active_prospects),
          closedThisMonth: toNumber(commercialSummary?.closed_this_month),
          byStatus: [
            {
              status: "Análise Financeira",
              count: toNumber(commercialSummary?.financial_analysis),
            },
            { status: "Análise/Agendamento", count: toNumber(commercialSummary?.scheduling) },
            { status: "Envio de Proposta", count: toNumber(commercialSummary?.proposal) },
            { status: "Paralisado", count: toNumber(commercialSummary?.paused) },
            { status: "Recusado pelo Cliente", count: toNumber(commercialSummary?.refused) },
            { status: "Fechado", count: toNumber(commercialSummary?.closed) },
          ],
          billing: {
            pending: toNumber(commercialBilling?.pending),
            contracted: toNumber(commercialBilling?.contracted),
            notContracted: toNumber(commercialBilling?.not_contracted),
          },
        },
        departments: departmentSummaryResult.rows.map((department) => ({
          id: department.id,
          name: department.name,
          openTasks: toNumber(department.open_tasks),
          completedTasks: toNumber(department.completed_tasks),
          urgentTasks: toNumber(department.urgent_tasks),
        })),
        recentClients: recentClientsResult.rows.map((client) => ({
          id: client.id,
          name: client.name ?? "Cliente sem nome",
          status: client.status ?? "",
          segmento: client.segment ?? "Não informado",
          entryDate: formatIsoDate(client.entry_date),
        })),
        insights: [
          {
            type: "info",
            title: "Clientes ativos",
            description: `${totalClients} clientes ativos cadastrados no sistema.`,
          },
          {
            type: pendingTasks > 0 ? "warning" : "success",
            title: "Tarefas em aberto",
            description: `${pendingTasks} tarefas ainda não foram concluídas.`,
          },
        ],
        tasks: {
          today: toNumber(taskSummary?.today),
          completedToday: toNumber(taskSummary?.completed_today),
          pending: pendingTasks,
          urgent: toNumber(taskSummary?.urgent),
        },
        notifications: {
          total: toNumber(notifications?.total),
          urgent: 0,
          pending: toNumber(notifications?.pending),
        },
        projects: {
          active: activeProjects,
          completed: completedProjects,
          inProgress: toNumber(projectSummary?.in_progress),
          delayed: toNumber(projectSummary?.delayed),
          waiting: toNumber(projectSummary?.waiting),
        },
        performance: performanceResult.rows.map((row) => ({
          week: row.week,
          tasks: toNumber(row.tasks),
          completed: toNumber(row.completed),
        })),
        pendingTasks: pendingTasksResult.rows.map((task) => ({
          title: task.title ?? "Tarefa sem nome",
          priority: getPriority(task.urgency),
          dueDate: formatDueDate(task.prevision_date),
          status: task.is_urgent ? "urgent" : "pending",
        })),
        activities: activitiesResult.rows
          .filter(isEligibleActivity)
          .flatMap((activity) => {
            const description = describeActivityRow(activity);
            return description ? [{ activity, description }] : [];
          })
          .slice(0, DASHBOARD_ACTIVITY_LIMIT)
          .map(({ activity, description }, index) => {
            const user = activity.user_name ?? "Usuário";
            return {
              user,
              action: description.action,
              item: description.item,
              createdAt: formatNullableIsoDate(activity.created_at),
              avatar: initials(user),
              tone: ACTIVITY_TONES[index % ACTIVITY_TONES.length] ?? "blue",
            };
          }),
      };
    } catch (err) {
      if (err instanceof ServiceError) {
        throw err;
      }

      logError("Erro ao carregar estatísticas do dashboard", { err, organizationId });
      throw new ServiceError(500, "Não foi possível carregar os dados do dashboard.");
    }
  }

  private getPool(): Queryable {
    if (this.injectedPool) {
      return this.injectedPool;
    }

    if (!this.databaseUrl) {
      throw new ServiceError(500, "DATABASE_URL não configurado para o dashboard.");
    }

    this.pool ??= new Pool({
      connectionString: this.databaseUrl,
      max: parseDatabasePoolMax(process.env.DATABASE_POOL_MAX),
      connectionTimeoutMillis: parseDatabasePoolConnectionTimeoutMs(
        process.env.DATABASE_POOL_CONNECTION_TIMEOUT_MS,
      ),
      ssl: this.databaseUrl.includes("supabase.com")
        ? {
            rejectUnauthorized: false,
          }
        : undefined,
    });

    return this.pool;
  }
}

const ACTIVE_CLIENT_CONDITION = "lower(coalesce(status, '')) = 'ativo' and deletion_date is null";
const COMPLETED_TASK_STATUS_SQL = `array[${COMPLETED_TASK_STATUSES.map((status) => `'${status}'`).join(", ")}]`;
const OPEN_TASK_CONDITION = `
  lower(coalesce(status, '')) <> all(${COMPLETED_TASK_STATUS_SQL})
  and lower(coalesce(status, '')) not like '%não contratado%'
  and lower(coalesce(status, '')) not like '%nao contratado%'
  and lower(coalesce(status, '')) <> 'migrado'
`;
const OPEN_TASK_CONDITION_WITH_TASK_ALIAS = `
  lower(coalesce(t.status, '')) <> all(${COMPLETED_TASK_STATUS_SQL})
  and lower(coalesce(t.status, '')) not like '%não contratado%'
  and lower(coalesce(t.status, '')) not like '%nao contratado%'
  and lower(coalesce(t.status, '')) <> 'migrado'
`;
const INACTIVE_PROJECT_STATUS_LIST = INACTIVE_PROJECT_STATUSES.map((status) => `'${status}'`).join(
  ", ",
);

const CLIENT_SUMMARY_SQL = `
  select
    count(*) filter (where ${ACTIVE_CLIENT_CONDITION})::int as active_total,
    count(*) filter (where ${ACTIVE_CLIENT_CONDITION} and contabil is true)::int as contabil,
    count(*) filter (where ${ACTIVE_CLIENT_CONDITION} and fiscal is true)::int as fiscal,
    count(*) filter (where ${ACTIVE_CLIENT_CONDITION} and pessoal is true)::int as pessoal,
    count(*) filter (where ${ACTIVE_CLIENT_CONDITION} and infoproduto is true)::int as infoproduto,
    count(*) filter (where ${ACTIVE_CLIENT_CONDITION} and consultoria is true)::int as consultoria,
    count(*) filter (where ${ACTIVE_CLIENT_CONDITION} and castelo_med is true)::int as castelo_med
  from public.clients
  where organization_id = $1
`;

const MONTHLY_CLIENTS_SQL = `
  select
    to_char(date_trunc('month', coalesce(competence_entry, register_date_prospecting, customer_since)), 'YYYY-MM') as month,
    count(*)::int as new_clients
  from public.clients
  where organization_id = $1
    and ${ACTIVE_CLIENT_CONDITION}
    and coalesce(competence_entry, register_date_prospecting, customer_since) >= date_trunc('month', current_date) - interval '5 months'
  group by 1
  order by 1
`;

const RECENT_CLIENTS_SQL = `
  select
    id,
    coalesce(nullif(fantasy_name, ''), nullif(company_name, ''), nullif(name, '')) as name,
    status,
    segment,
    coalesce(competence_entry, register_date_prospecting, customer_since) as entry_date
  from public.clients
  where organization_id = $1
    and ${ACTIVE_CLIENT_CONDITION}
  order by coalesce(competence_entry, register_date_prospecting, customer_since) desc nulls last, name asc
  limit 5
`;

const TASK_SUMMARY_SQL = `
  select
    count(*) filter (where ${OPEN_TASK_CONDITION} and prevision_date::date = current_date)::int as today,
    count(*) filter (where lower(coalesce(status, '')) = any(${COMPLETED_TASK_STATUS_SQL}) and end_date::date = current_date)::int as completed_today,
    count(*) filter (where ${OPEN_TASK_CONDITION})::int as pending,
    count(*) filter (
      where ${OPEN_TASK_CONDITION}
        and (
          prevision_date::date < current_date
          or lower(coalesce(urgency, '')) in ('alta', 'alto', 'urgente', 'crítica', 'critica', 'crítico', 'critico')
        )
    )::int as urgent
  from public."integracao.tasks"
  where organization_id = $1
`;

const PENDING_TASKS_SQL = `
  select
    name as title,
    urgency,
    prevision_date,
    (
      prevision_date::date < current_date
      or lower(coalesce(urgency, '')) in ('alta', 'alto', 'urgente', 'crítica', 'critica', 'crítico', 'critico')
    ) as is_urgent
  from public."integracao.tasks"
  where organization_id = $1
    and ${OPEN_TASK_CONDITION}
  order by is_urgent desc, prevision_date asc nulls last, date_created desc nulls last
  limit 5
`;

const PROJECT_SUMMARY_SQL = `
  select
    count(*) filter (where lower(coalesce(status, '')) not in (${INACTIVE_PROJECT_STATUS_LIST}))::int as active,
    count(*) filter (where lower(coalesce(status, '')) in ('fechado', 'concluído', 'concluido'))::int as completed,
    count(*) filter (where lower(coalesce(status, '')) in ('paralisado', 'em andamento', 'andamento'))::int as in_progress,
    count(*) filter (where lower(coalesce(status, '')) = 'paralisado')::int as delayed,
    count(*) filter (where lower(coalesce(status, '')) in ('análise/agendamento', 'analise/agendamento', 'envio de proposta'))::int as waiting
  from public."integracao.projects"
  where organization_id = $1
`;

const NOTIFICATION_SUMMARY_SQL = `
  select
    (
      (select count(*) from public."notification.certificate" where organization_id = $1)
      + (select count(*) from public."notification.pessoal" where organization_id = $1)
      + (select count(*) from public."notification.regularize" where organization_id = $1)
    )::int as total,
    (
      (select count(*) from public."notification.certificate" where organization_id = $1)
      + (select count(*) from public."notification.pessoal" where organization_id = $1 and read is false)
      + (select count(*) from public."notification.regularize" where organization_id = $1 and read is false)
    )::int as pending
`;

const CERTIFICATE_RECEIPTS_SQL = `
  with certificates as (
    select was_paid, payment_date, payment_amount
    from public."certificate.pj"
    where organization_id = $1
    union all
    select was_paid, payment_date, payment_amount
    from public."certificate.pf"
    where organization_id = $1
  ), months as (
    select generate_series(
      date_trunc('month', current_date) - interval '6 months',
      date_trunc('month', current_date),
      interval '1 month'
    ) as month
  )
  select
    to_char(months.month, 'YYYY-MM') as month,
    coalesce(sum(certificates.payment_amount) filter (where certificates.was_paid is true), 0)::numeric as paid_amount,
    (
      select count(*)::int
      from certificates
      where certificates.was_paid is not true
    ) as unpaid_certificates
  from months
  left join certificates
    on certificates.was_paid is true
    and certificates.payment_date >= months.month
    and certificates.payment_date < months.month + interval '1 month'
  group by months.month
  order by months.month
`;

const COMMERCIAL_SUMMARY_SQL = `
  select
    count(*) filter (
      where archived_at is null
        and status not in ('Fechado', 'Recusado pelo Cliente')
    )::int as active_prospects,
    count(*) filter (
      where archived_at is null
        and status = 'Fechado'
        and status_date >= date_trunc('month', current_date)
    )::int as closed_this_month,
    count(*) filter (where archived_at is null and status = 'Análise Financeira')::int as financial_analysis,
    count(*) filter (where archived_at is null and status = 'Análise/Agendamento')::int as scheduling,
    count(*) filter (where archived_at is null and status = 'Envio de Proposta')::int as proposal,
    count(*) filter (where archived_at is null and status = 'Paralisado')::int as paused,
    count(*) filter (where archived_at is null and status = 'Recusado pelo Cliente')::int as refused,
    count(*) filter (where archived_at is null and status = 'Fechado')::int as closed
  from public."commercial.prospecting"
  where organization_id = $1
`;

const COMMERCIAL_BILLING_SUMMARY_SQL = `
  select
    count(*) filter (where hiring_status = 'A Realizar')::int as pending,
    count(*) filter (where hiring_status = 'Contratado')::int as contracted,
    count(*) filter (where hiring_status = 'Não Contratado')::int as not_contracted
  from public."commercial.task_billing"
  where organization_id = $1
`;

const DEPARTMENT_SUMMARY_SQL = `
  select
    d.id,
    d.name,
    count(t.id) filter (where ${OPEN_TASK_CONDITION_WITH_TASK_ALIAS})::int as open_tasks,
    count(t.id) filter (where lower(coalesce(t.status, '')) = any(${COMPLETED_TASK_STATUS_SQL}))::int as completed_tasks,
    count(t.id) filter (
      where ${OPEN_TASK_CONDITION_WITH_TASK_ALIAS}
        and (
          t.prevision_date::date < current_date
          or lower(coalesce(t.urgency, '')) in ('alta', 'alto', 'urgente', 'crítica', 'critica', 'crítico', 'critico')
        )
    )::int as urgent_tasks
  from public.departments d
  left join public."integracao.tasks" t
    on t.department_id = d.id
    and t.organization_id = $1
  where d.organization_id = $1
  group by d.id, d.name
  order by open_tasks desc, d.name asc
`;

const PERFORMANCE_SQL = `
  with weeks as (
    select
      row_number() over (order by week_start) as position,
      week_start,
      week_start + interval '1 week' as week_end
    from generate_series(
      date_trunc('week', current_date) - interval '3 weeks',
      date_trunc('week', current_date),
      interval '1 week'
    ) as week_start
  )
  select
    ('Sem ' || position)::text as week,
    count(t.id) filter (where t.date_created >= week_start and t.date_created < week_end)::int as tasks,
    count(t.id) filter (where t.end_date >= week_start and t.end_date < week_end and lower(coalesce(t.status, '')) = any(${COMPLETED_TASK_STATUS_SQL}))::int as completed
  from weeks
  left join public."integracao.tasks" t on t.organization_id = $1
  group by position, week_start
  order by position
`;

const ACTIVITIES_SQL = `
  select
    coalesce(nullif(u.full_name, ''), nullif(u.name, ''), nullif(u.login, '')) as user_name,
    a.action,
    a.method,
    coalesce(nullif(a.referring, ''), nullif(a.referring_id, '')) as item,
    a.path,
    a.created_at,
    a.outcome,
    (a.metadata_json ->> 'activityVisible')::boolean as activity_visible
  from public.audit_requests a
  left join public.users u on u.id = a.user_id
  where a.organization_id = $1
    and upper(coalesce(a.method, '')) not in ('GET', 'HEAD', 'OPTIONS')
    and (
      not coalesce(a.metadata_json ? 'activityVisible', false)
      or (
        a.metadata_json @> '{"activityVisible": true}'::jsonb
        and a.outcome = 'success'
      )
    )
  order by a.created_at desc
  limit 20
`;

const UPDATED_AT_SQL = `
  select max(updated_at) as updated_at
  from (
    select max(date_status) as updated_at
    from public.clients
    where organization_id = $1
      and deletion_date is null

    union all
    select max(competence_entry) as updated_at
    from public.clients
    where organization_id = $1
      and deletion_date is null

    union all
    select max(register_date_prospecting) as updated_at
    from public.clients
    where organization_id = $1
      and deletion_date is null

    union all
    select max(customer_since) as updated_at
    from public.clients
    where organization_id = $1
      and deletion_date is null

    union all
    select max(date_updated) as updated_at
    from public."integracao.tasks"
    where organization_id = $1

    union all
    select max(date_created) as updated_at
    from public."integracao.tasks"
    where organization_id = $1

    union all
    select max(end_date) as updated_at
    from public."integracao.tasks"
    where organization_id = $1

    union all
    select max(date) as updated_at
    from public."notification.certificate"
    where organization_id = $1

    union all
    select max(create_at) as updated_at
    from public."notification.pessoal"
    where organization_id = $1

    union all
    select max(reference_date) as updated_at
    from public."notification.pessoal"
    where organization_id = $1

    union all
    select max(create_at) as updated_at
    from public."notification.regularize"
    where organization_id = $1

    union all
    select max(payment_date) as updated_at
    from public."certificate.pj"
    where organization_id = $1

    union all
    select max(payment_date) as updated_at
    from public."certificate.pf"
    where organization_id = $1

    union all
    select max(updated_at) as updated_at
    from public."commercial.prospecting"
    where organization_id = $1

    union all
    select max(updated_at) as updated_at
    from public."commercial.task_billing"
    where organization_id = $1
  ) sources
  where updated_at <= current_timestamp
`;
