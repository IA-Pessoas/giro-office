import type { DashboardStats } from "../types/index.ts";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberOr0(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function arrayOrEmpty<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function numbers<K extends string>(value: unknown, keys: readonly K[]): Record<K, number> {
  const source = isRecord(value) ? value : {};
  return Object.fromEntries(keys.map((key) => [key, numberOr0(source[key])])) as Record<K, number>;
}

function isApiRoute(value: unknown): boolean {
  return typeof value === "string" && value.trim().startsWith("/");
}

/**
 * Completa o formato de `/dashboard/stats` com zeros e listas vazias. Uma resposta parcial ou
 * fora do formato derrubava o dashboard, o erro remontava o app e todo o shell era buscado de
 * novo, multiplicando as requisições (#1369).
 */
export function normalizeDashboardStats(payload: unknown): DashboardStats {
  const stats = isRecord(payload) ? payload : {};
  const financial = isRecord(stats.financial) ? stats.financial : {};
  const commercial = isRecord(stats.commercial) ? stats.commercial : {};

  return {
    updatedAt: typeof stats.updatedAt === "string" ? stats.updatedAt : null,
    totalClients: numberOr0(stats.totalClients),
    clientsByService: numbers(stats.clientsByService, [
      "contabil",
      "fiscal",
      "pessoal",
      "infoproduto",
      "consultoria",
      "castelo_med",
    ]),
    monthlyTrends: arrayOrEmpty(stats.monthlyTrends),
    financial: {
      ...numbers(financial, ["paidCertificateReceipts", "unpaidCertificates"]),
      monthlyPaidCertificateReceipts: arrayOrEmpty(financial.monthlyPaidCertificateReceipts),
    },
    commercial: {
      ...numbers(commercial, ["activeProspects", "closedThisMonth"]),
      byStatus: arrayOrEmpty(commercial.byStatus),
      billing: numbers(commercial.billing, ["pending", "contracted", "notContracted"]),
    },
    departments: arrayOrEmpty(stats.departments),
    recentClients: arrayOrEmpty(stats.recentClients),
    insights: arrayOrEmpty(stats.insights),
    tasks: numbers(stats.tasks, ["today", "completedToday", "pending", "urgent"]),
    notifications: numbers(stats.notifications, ["total", "urgent", "pending"]),
    projects: numbers(stats.projects, ["active", "completed", "inProgress", "delayed", "waiting"]),
    performance: arrayOrEmpty(stats.performance),
    pendingTasks: arrayOrEmpty(stats.pendingTasks),
    // Defesa: rota de API crua ("acessou /user/me") não é atividade de negócio (#1371).
    activities: arrayOrEmpty<DashboardStats["activities"][number]>(stats.activities).filter(
      (activity) => isRecord(activity) && !isApiRoute(activity.action) && !isApiRoute(activity.item),
    ),
  };
}
