import { ServiceError } from "@workspace/shared";

import type { GatewayEnv } from "../config/env.js";

const DASHBOARD_CLIENT_SERVICE_FILTERS = [
  ["contabil", "Departamento contabil"],
  ["fiscal", "Departamento fiscal"],
  ["pessoal", "Departamento pessoal"],
  ["infoproduto", "Departamento infoproduto"],
  ["consultoria", "Departamento consultoria"],
  ["castelo_med", "Departamento castelo_med"],
] as const;

type ClientServiceKey = (typeof DASHBOARD_CLIENT_SERVICE_FILTERS)[number][0];

type ClientListPage = {
  items: Array<{
    id: string;
    name: string;
    status: string;
    segment?: string | null;
    segmento?: string | null;
    created_at?: string | null;
    createdAt?: string | null;
    entryDate?: string | null;
    customer_since?: string | null;
  }>;
  total: number;
};

type ProjectMetrics = {
  total: number;
  completed: number;
  inProgress: number;
  paused: number;
  toDo: number;
  notContracted: number;
  taskMetrics: {
    total: number;
    completed: number;
    open: number;
    paused: number;
    emptyStatus: number;
  };
};

type DashboardStats = {
  totalClients: number;
  clientsByService: Record<ClientServiceKey, number>;
  monthlyTrends: Array<{
    month: string;
    newClients: number;
  }>;
  fiscal: {
    obligations: Array<{
      status: "Pendente" | "Emitida" | "Atrasada";
      count: number;
    }>;
  };
  recentClients: Array<{
    id: string;
    name: string;
    status: string;
    segmento: string;
    entryDate: string;
  }>;
  projectMetrics: ProjectMetrics;
  insights: Array<{
    type: "info" | "warning" | "success";
    title: string;
    description: string;
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
    throw new ServiceError(502, "Erro ao consultar upstream do dashboard.", err);
  }

  if (!response.ok) {
    throw new ServiceError(502, `Erro ao buscar dados reais do dashboard (${response.status}).`);
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

function buildProjectMetricsUrl(projectServiceUrl: string): string {
  return new URL("/project/metrics", projectServiceUrl).toString();
}

function mapRecentClients(page: ClientListPage): DashboardStats["recentClients"] {
  return page.items.map((client) => ({
    id: client.id,
    name: client.name,
    status: client.status,
    segmento: client.segment ?? client.segmento ?? "Não informado",
    entryDate:
      client.entryDate ??
      client.customer_since ??
      client.created_at ??
      client.createdAt ??
      new Date(0).toISOString(),
  }));
}

function buildInsights(
  totalClients: number,
  projectMetrics: ProjectMetrics,
): DashboardStats["insights"] {
  return [
    {
      type: "info",
      title: "Base de clientes",
      description: `${totalClients} clientes cadastrados na organização.`,
    },
    {
      type: projectMetrics.paused > 0 ? "warning" : "success",
      title: "Projetos em andamento",
      description: `${projectMetrics.inProgress} em andamento, ${projectMetrics.completed} concluídos e ${projectMetrics.paused} paralisados.`,
    },
    {
      type: projectMetrics.taskMetrics.open > 0 ? "info" : "success",
      title: "Tarefas de projetos",
      description: `${projectMetrics.taskMetrics.open} abertas de ${projectMetrics.taskMetrics.total} tarefas monitoradas.`,
    },
  ];
}

export class DashboardStatsService {
  constructor(
    private readonly env: GatewayEnv,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  async getStats(authorization: string): Promise<DashboardStats> {
    const recentClientsPromise = fetchJson<ClientListPage>(
      this.fetchImpl,
      buildClientListUrl(this.env.clientServiceUrl, { page: 1, limit: 5 }),
      authorization,
    );
    const clientServiceCountPromises = DASHBOARD_CLIENT_SERVICE_FILTERS.map(
      async ([key, status]) => {
        const page = await fetchJson<ClientListPage>(
          this.fetchImpl,
          buildClientListUrl(this.env.clientServiceUrl, {
            ref: "deps",
            status,
            page: 1,
            limit: 1,
          }),
          authorization,
        );

        return [key, page.total] as const;
      },
    );
    const projectMetricsPromise = fetchJson<ProjectMetrics>(
      this.fetchImpl,
      buildProjectMetricsUrl(this.env.projectServiceUrl),
      authorization,
    );

    const [recentClientsPage, clientServiceCounts, projectMetrics] = await Promise.all([
      recentClientsPromise,
      Promise.all(clientServiceCountPromises),
      projectMetricsPromise,
    ]);

    const clientsByService = Object.fromEntries(clientServiceCounts) as Record<
      ClientServiceKey,
      number
    >;

    return {
      totalClients: recentClientsPage.total,
      clientsByService,
      monthlyTrends: [],
      fiscal: {
        obligations: [],
      },
      recentClients: mapRecentClients(recentClientsPage),
      projectMetrics,
      insights: buildInsights(recentClientsPage.total, projectMetrics),
    };
  }
}
