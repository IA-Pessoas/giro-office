import { ServiceError } from "@workspace/shared";

import type { GatewayEnv } from "../config/env.js";

type LegacyBudgetItem = {
  description?: string | null;
  quantity?: number | string | null;
  unit_price?: number | string | null;
  unitPrice?: number | string | null;
  total_amount?: number | string | null;
  total?: number | string | null;
  destination?: string | null;
  purpose?: string | null;
  vendor_name?: string | null;
  status?: string | null;
};

type LegacyBudget = {
  id: string;
  title: string;
  status: string;
  items?: LegacyBudgetItem[] | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type LegacyMarketingPassword = {
  id: string;
  local: string;
  user: string;
  notes?: string | null;
  updatedAt?: string | null;
};

type MarketingDashboardStats = {
  summary: {
    totalBudgets: number;
    pendingBudgets: number;
    approvedBudgets: number;
    rejectedBudgets: number;
    purchasedBudgets: number;
    totalBudgetValue: number;
    marketingPasswords: number;
  };
  budgetsByStatus: Array<{
    status: string;
    count: number;
  }>;
  spendingByDestination: Array<{
    destination: string;
    total: number;
  }>;
  recentBudgets: Array<{
    id: string;
    title: string;
    status: string;
    totalValue: number;
    createdAt: string | null;
  }>;
  marketingPasswords: {
    total: number;
    recent: Array<{
      id: string;
      local: string;
      user: string;
      updatedAt: string | null;
    }>;
  };
};

type Envelope<T> = {
  data?: T;
  result?: T;
};

type FetchLike = typeof fetch;

function unwrapLegacyResponse<T>(payload: unknown): T {
  if (payload !== null && typeof payload === "object") {
    if ("data" in payload) {
      return (payload as Envelope<T>).data as T;
    }
    if ("result" in payload) {
      return (payload as Envelope<T>).result as T;
    }
  }

  return payload as T;
}

async function fetchJson<T>(fetchImpl: FetchLike, url: string, authorization: string): Promise<T> {
  let response: Response;

  try {
    response = await fetchImpl(url, {
      headers: {
        authorization,
      },
    });
  } catch (err) {
    throw new ServiceError(502, "Erro ao consultar upstream do dashboard de Marketing.", err);
  }

  if (!response.ok) {
    throw new ServiceError(
      502,
      `Erro ao buscar dados reais do dashboard de Marketing (${response.status}).`,
    );
  }

  return unwrapLegacyResponse<T>(await response.json());
}

function buildLegacyUrl(legacyApiUrl: string, path: string): string {
  return new URL(path, legacyApiUrl).toString();
}

function parseNumber(value: number | string | null | undefined): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.replace(/\./g, "").replace(",", ".");
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function getBudgetItems(budget: LegacyBudget): LegacyBudgetItem[] {
  return Array.isArray(budget.items) ? budget.items : [];
}

function getBudgetItemTotal(item: LegacyBudgetItem): number {
  const explicitTotal = parseNumber(item.total_amount ?? item.total);

  if (explicitTotal > 0) {
    return explicitTotal;
  }

  return parseNumber(item.quantity) * parseNumber(item.unit_price ?? item.unitPrice);
}

function getBudgetTotal(budget: LegacyBudget): number {
  return getBudgetItems(budget).reduce((total, item) => total + getBudgetItemTotal(item), 0);
}

function countByStatus(budgets: LegacyBudget[]): MarketingDashboardStats["budgetsByStatus"] {
  const counts = new Map<string, number>();

  for (const budget of budgets) {
    counts.set(budget.status, (counts.get(budget.status) ?? 0) + 1);
  }

  return [...counts.entries()].map(([status, count]) => ({ status, count }));
}

function groupSpendingByDestination(
  budgets: LegacyBudget[],
): MarketingDashboardStats["spendingByDestination"] {
  const totals = new Map<string, number>();

  for (const budget of budgets) {
    for (const item of getBudgetItems(budget)) {
      const destination = item.destination?.trim() || "Não informado";
      totals.set(destination, (totals.get(destination) ?? 0) + getBudgetItemTotal(item));
    }
  }

  return [...totals.entries()].map(([destination, total]) => ({ destination, total }));
}

function sortByDateDesc<T extends { createdAt?: string | null; updatedAt?: string | null }>(
  items: T[],
): T[] {
  return [...items].sort((left, right) => {
    const leftDate = Date.parse(left.createdAt ?? left.updatedAt ?? "");
    const rightDate = Date.parse(right.createdAt ?? right.updatedAt ?? "");
    return (
      (Number.isFinite(rightDate) ? rightDate : 0) - (Number.isFinite(leftDate) ? leftDate : 0)
    );
  });
}

export class MarketingDashboardStatsService {
  constructor(
    private readonly env: GatewayEnv,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  async getStats(authorization: string): Promise<MarketingDashboardStats> {
    const [budgets, marketingPasswords] = await Promise.all([
      fetchJson<LegacyBudget[]>(
        this.fetchImpl,
        buildLegacyUrl(this.env.legacyApiUrl, "/budgets"),
        authorization,
      ),
      fetchJson<LegacyMarketingPassword[]>(
        this.fetchImpl,
        buildLegacyUrl(this.env.legacyApiUrl, "/mkt/passwords/all"),
        authorization,
      ),
    ]);

    const totalBudgetValue = budgets.reduce((total, budget) => total + getBudgetTotal(budget), 0);
    const statusCounts = new Map(countByStatus(budgets).map((item) => [item.status, item.count]));

    return {
      summary: {
        totalBudgets: budgets.length,
        pendingBudgets: statusCounts.get("pending") ?? 0,
        approvedBudgets: statusCounts.get("approved") ?? 0,
        rejectedBudgets: statusCounts.get("rejected") ?? 0,
        purchasedBudgets: statusCounts.get("purchased") ?? 0,
        totalBudgetValue,
        marketingPasswords: marketingPasswords.length,
      },
      budgetsByStatus: countByStatus(budgets),
      spendingByDestination: groupSpendingByDestination(budgets),
      recentBudgets: sortByDateDesc(budgets)
        .slice(0, 5)
        .map((budget) => ({
          id: budget.id,
          title: budget.title,
          status: budget.status,
          totalValue: getBudgetTotal(budget),
          createdAt: budget.createdAt ?? null,
        })),
      marketingPasswords: {
        total: marketingPasswords.length,
        recent: sortByDateDesc(marketingPasswords)
          .slice(0, 5)
          .map((password) => ({
            id: password.id,
            local: password.local,
            user: password.user,
            updatedAt: password.updatedAt ?? null,
          })),
      },
    };
  }
}
