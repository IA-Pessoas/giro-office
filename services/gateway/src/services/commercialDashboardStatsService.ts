import { ServiceError } from "@workspace/shared";

import type { GatewayEnv } from "../config/env.js";

const COMMERCIAL_CLIENT_STATUSES = ["Prospecção", "Fechado", "Ativo", "Inativo"] as const;
const COMPLETED_TASK_STATUS = "Concluída";

type CommercialClientStatus = (typeof COMMERCIAL_CLIENT_STATUSES)[number];

type ClientListPage = {
  items: Array<{
    id: string;
    name: string;
    status: string;
    company_name?: string | null;
    fantasy_name?: string | null;
  }>;
  total: number;
};

type CommercialTaskListPage = {
  data: Array<{
    id: string;
    name: string;
    status: string;
    hiring_status: string | null;
    payment: string | null;
    billing_description: string | null;
  }>;
  hasMore: boolean;
};

type CommercialDashboardStats = {
  summary: {
    totalClients: number;
    prospectingClients: number;
    closedClients: number;
    activeClients: number;
    inactiveClients: number;
    commercialTasks: number;
    openCommercialTasks: number;
    conversionRate: number;
  };
  funnel: Array<{
    status: CommercialClientStatus;
    count: number;
  }>;
  commercialTasks: {
    total: number;
    open: number;
    completed: number;
    byStatus: Array<{
      status: string;
      count: number;
    }>;
    recent: Array<{
      id: string;
      name: string;
      status: string;
      hiringStatus: string | null;
      payment: string | null;
    }>;
  };
  recentProspects: Array<{
    id: string;
    name: string;
    status: string;
    company: string;
  }>;
};

type Envelope<T> = {
  success?: boolean;
  data?: T;
};

type FetchLike = typeof fetch;

function unwrapEnvelope<T>(payload: unknown): T {
  if (payload !== null && typeof payload === "object" && "data" in payload) {
    return (payload as Envelope<T>).data as T;
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
    throw new ServiceError(502, "Erro ao consultar upstream do dashboard comercial.", err);
  }

  if (!response.ok) {
    throw new ServiceError(
      502,
      `Erro ao buscar dados reais do dashboard comercial (${response.status}).`,
    );
  }

  return unwrapEnvelope<T>(await response.json());
}

function buildClientListUrl(
  clientServiceUrl: string,
  params: Record<string, string | number>,
): string {
  const url = new URL("/client/list", clientServiceUrl);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  return url.toString();
}

function buildCommercialTaskListUrl(taskServiceUrl: string, page: number): string {
  const url = new URL("/task/list", taskServiceUrl);
  url.searchParams.set("status", "Todos");
  url.searchParams.set("ref", "CobrançaComercial");
  url.searchParams.set("ref_id", "");
  url.searchParams.set("search", "");
  url.searchParams.set("page", String(page));
  url.searchParams.set("limit", "100");

  return url.toString();
}

function mapRecentProspects(page: ClientListPage): CommercialDashboardStats["recentProspects"] {
  return page.items.map((client) => ({
    id: client.id,
    name: client.name,
    status: client.status,
    company: client.company_name ?? client.fantasy_name ?? client.name,
  }));
}

function groupTasksByStatus(
  tasks: CommercialTaskListPage["data"],
): CommercialDashboardStats["commercialTasks"]["byStatus"] {
  const counts = new Map<string, number>();

  for (const task of tasks) {
    counts.set(task.status, (counts.get(task.status) ?? 0) + 1);
  }

  return [...counts.entries()].map(([status, count]) => ({ status, count }));
}

function calculateConversionRate(prospectingClients: number, closedClients: number): number {
  const totalPipelineClients = prospectingClients + closedClients;

  if (totalPipelineClients === 0) {
    return 0;
  }

  return Number(((closedClients / totalPipelineClients) * 100).toFixed(1));
}

export class CommercialDashboardStatsService {
  constructor(
    private readonly env: GatewayEnv,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  private async listAllCommercialTasks(
    authorization: string,
  ): Promise<CommercialTaskListPage["data"]> {
    const tasks: CommercialTaskListPage["data"] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const result = await fetchJson<CommercialTaskListPage>(
        this.fetchImpl,
        buildCommercialTaskListUrl(this.env.taskServiceUrl, page),
        authorization,
      );

      tasks.push(...result.data);
      hasMore = result.hasMore;
      page += 1;
    }

    return tasks;
  }

  async getStats(authorization: string): Promise<CommercialDashboardStats> {
    const totalClientsPage = await fetchJson<ClientListPage>(
      this.fetchImpl,
      buildClientListUrl(this.env.clientServiceUrl, { page: 1, limit: 1 }),
      authorization,
    );
    const prospectingClientsPage = await fetchJson<ClientListPage>(
      this.fetchImpl,
      buildClientListUrl(this.env.clientServiceUrl, {
        status: "Prospecção",
        page: 1,
        limit: 5,
      }),
      authorization,
    );
    const closedClientsPage = await fetchJson<ClientListPage>(
      this.fetchImpl,
      buildClientListUrl(this.env.clientServiceUrl, {
        status: "Fechado",
        page: 1,
        limit: 1,
      }),
      authorization,
    );
    const activeClientsPage = await fetchJson<ClientListPage>(
      this.fetchImpl,
      buildClientListUrl(this.env.clientServiceUrl, {
        status: "Ativo",
        page: 1,
        limit: 1,
      }),
      authorization,
    );
    const inactiveClientsPage = await fetchJson<ClientListPage>(
      this.fetchImpl,
      buildClientListUrl(this.env.clientServiceUrl, {
        status: "Inativo",
        page: 1,
        limit: 1,
      }),
      authorization,
    );
    const commercialTasks = await this.listAllCommercialTasks(authorization);
    const completedCommercialTasks = commercialTasks.filter(
      (task) => task.status === COMPLETED_TASK_STATUS,
    ).length;
    const openCommercialTasks = commercialTasks.length - completedCommercialTasks;

    return {
      summary: {
        totalClients: totalClientsPage.total,
        prospectingClients: prospectingClientsPage.total,
        closedClients: closedClientsPage.total,
        activeClients: activeClientsPage.total,
        inactiveClients: inactiveClientsPage.total,
        commercialTasks: commercialTasks.length,
        openCommercialTasks,
        conversionRate: calculateConversionRate(
          prospectingClientsPage.total,
          closedClientsPage.total,
        ),
      },
      funnel: COMMERCIAL_CLIENT_STATUSES.map((status) => ({
        status,
        count:
          status === "Prospecção"
            ? prospectingClientsPage.total
            : status === "Fechado"
              ? closedClientsPage.total
              : status === "Ativo"
                ? activeClientsPage.total
                : inactiveClientsPage.total,
      })),
      commercialTasks: {
        total: commercialTasks.length,
        open: openCommercialTasks,
        completed: completedCommercialTasks,
        byStatus: groupTasksByStatus(commercialTasks),
        recent: commercialTasks.slice(0, 5).map((task) => ({
          id: task.id,
          name: task.name,
          status: task.status,
          hiringStatus: task.hiring_status,
          payment: task.payment,
        })),
      },
      recentProspects: mapRecentProspects(prospectingClientsPage),
    };
  }
}
