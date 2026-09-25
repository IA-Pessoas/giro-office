import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { DashboardStatsService } from "./dashboardStatsService.js";

function result(rows: unknown[]) {
  return {
    rows,
    command: "SELECT",
    rowCount: rows.length,
    oid: 0,
    fields: [],
  };
}

function dashboardQueryMock(
  activities: unknown[] = [],
  metrics: {
    certificateReceipts?: unknown[];
    commercial?: unknown[];
    commercialBilling?: unknown[];
    departments?: unknown[];
  } = {},
) {
  const responses = [
    result([
      {
        active_total: 0,
        contabil: 0,
        fiscal: 0,
        pessoal: 0,
        infoproduto: 0,
        consultoria: 0,
        castelo_med: 0,
      },
    ]),
    result([]),
    result([]),
    result([{ today: 0, completed_today: 0, pending: 0, urgent: 0 }]),
    result([]),
    result([{ active: 0, completed: 0, in_progress: 0, delayed: 0, waiting: 0 }]),
    result([{ total: 0, pending: 0 }]),
    result(metrics.certificateReceipts ?? []),
    result(metrics.commercial ?? []),
    result(metrics.commercialBilling ?? []),
    result(metrics.departments ?? []),
    result([]),
    result(activities),
    result([{ updated_at: null }]),
  ];

  return vi.fn().mockImplementation(async () => responses.shift() ?? result([]));
}

describe("DashboardStatsService", () => {
  it("queues dashboard queries within the configured concurrency limit", async () => {
    let activeQueries = 0;
    let maxActiveQueries = 0;
    const releases: Array<() => void> = [];
    const query = vi.fn(
      () =>
        new Promise((resolve) => {
          activeQueries += 1;
          maxActiveQueries = Math.max(maxActiveQueries, activeQueries);
          releases.push(() => {
            activeQueries -= 1;
            resolve(result([]));
          });
        }),
    );
    const service = new DashboardStatsService({
      pool: { query } as never,
      maxConcurrentQueries: 2,
    });

    const statsPromise = service.getStats("org-1");

    await vi.waitFor(() => expect(query).toHaveBeenCalledTimes(2));

    for (let expectedCalls = 3; expectedCalls <= 14; expectedCalls += 1) {
      releases.shift()?.();
      await vi.waitFor(() => expect(query).toHaveBeenCalledTimes(expectedCalls));
    }

    while (releases.length > 0) {
      releases.shift()?.();
    }

    await statsPromise;

    expect(maxActiveQueries).toBe(2);
  });

  it("shares an in-flight dashboard load between users from the same organization", async () => {
    const query = dashboardQueryMock();
    const service = new DashboardStatsService({ pool: { query } as never });

    await Promise.all([service.getStats("org-1"), service.getStats("org-1")]);

    expect(query).toHaveBeenCalledTimes(14);
  });

  it("continues processing queued queries after a database failure", async () => {
    const query = vi
      .fn()
      .mockRejectedValueOnce(new Error("database unavailable"))
      .mockResolvedValue(result([]));
    const service = new DashboardStatsService({
      pool: { query } as never,
      maxConcurrentQueries: 1,
    });

    await expect(service.getStats("org-1")).rejects.toMatchObject({
      statusCode: 500,
    });
    await vi.waitFor(() => expect(query).toHaveBeenCalledTimes(14));
    await expect(service.getStats("org-1")).resolves.toBeDefined();

    expect(query).toHaveBeenCalledTimes(28);
  });

  it("limits the dashboard pool through DATABASE_POOL_MAX", () => {
    const source = readFileSync(new URL("./dashboardStatsService.ts", import.meta.url), "utf8");

    expect(source).toContain("max: parseDatabasePoolMax(process.env.DATABASE_POOL_MAX)");
  });

  it("returns semantic audit fields as friendly dashboard activity", async () => {
    const query = dashboardQueryMock([
      {
        user_name: "Davi",
        action: "cadastrou",
        method: "POST",
        item: "uma nova tarefa",
        path: "/task",
        created_at: new Date("2026-07-23T12:00:00.000Z"),
      },
    ]);
    const service = new DashboardStatsService({ pool: { query } as never });

    const stats = await service.getStats("org-1");

    expect(stats.activities[0]).toMatchObject({
      user: "Davi",
      action: "cadastrou",
      item: "uma nova tarefa",
      createdAt: "2026-07-23T12:00:00.000Z",
    });
    expect(stats.activities[0]).not.toHaveProperty("time");
  });

  it("filters new technical and unsuccessful events while keeping legacy rows eligible", async () => {
    const query = dashboardQueryMock();
    const service = new DashboardStatsService({ pool: { query } as never });

    await service.getStats("org-1");

    const activitiesSql = String(query.mock.calls[12]?.[0]);
    expect(activitiesSql).toContain("not coalesce(a.metadata_json ? 'activityVisible', false)");
    expect(activitiesSql).toContain("a.metadata_json @> '{\"activityVisible\": true}'::jsonb");
    expect(activitiesSql).toContain("a.outcome = 'success'");
    expect(activitiesSql).toContain("order by a.created_at desc");
    expect(activitiesSql).toContain("not in ('GET', 'HEAD', 'OPTIONS')");
    expect(activitiesSql).toContain("limit 20");
  });

  it("defends the activity feed against unfiltered query rows", async () => {
    const query = dashboardQueryMock([
      {
        user_name: "Legado",
        action: "cadastrou",
        method: "POST",
        item: "uma nova tarefa",
        path: "/task",
        created_at: new Date(),
        outcome: "error",
        activity_visible: null,
      },
      {
        user_name: "Sucesso",
        action: "cadastrou",
        method: "POST",
        item: "uma nova tarefa",
        path: "/task",
        created_at: new Date(),
        outcome: "success",
        activity_visible: true,
      },
      {
        user_name: "Erro",
        action: "cadastrou",
        method: "POST",
        item: "uma nova tarefa",
        path: "/task",
        created_at: new Date(),
        outcome: "error",
        activity_visible: true,
      },
      {
        user_name: "Abortado",
        action: "cadastrou",
        method: "POST",
        item: "uma nova tarefa",
        path: "/task",
        created_at: new Date(),
        outcome: "aborted",
        activity_visible: true,
      },
      {
        user_name: "Técnico",
        action: null,
        method: "GET",
        item: null,
        path: "/health",
        created_at: new Date(),
        outcome: "success",
        activity_visible: false,
      },
    ]);
    const service = new DashboardStatsService({ pool: { query } as never });

    const stats = await service.getStats("org-1");

    expect(stats.activities.map((activity) => activity.user)).toEqual(["Legado", "Sucesso"]);
  });

  it("drops read and raw API-route audit rows from the activity feed (#1371)", async () => {
    const legacy = { outcome: null, activity_visible: null, created_at: new Date() };
    const query = dashboardQueryMock([
      {
        ...legacy,
        user_name: "Leitura",
        action: null,
        method: "GET",
        item: null,
        path: "/user/me",
      },
      {
        ...legacy,
        user_name: "Rota",
        action: null,
        method: "POST",
        item: null,
        path: "/xpto/rota",
      },
      { ...legacy, user_name: "Catálogo", action: null, method: "POST", item: null, path: "/task" },
      ...Array.from({ length: 6 }, (_, index) => ({
        ...legacy,
        user_name: `Extra ${index}`,
        action: "atualizou",
        method: "PATCH",
        item: "uma tarefa",
        path: "/task/1",
      })),
    ]);
    const service = new DashboardStatsService({ pool: { query } as never });

    const stats = await service.getStats("org-1");

    expect(stats.activities).toHaveLength(5);
    expect(stats.activities[0]).toMatchObject({ user: "Catálogo", action: "cadastrou" });
    expect(stats.activities.some((activity) => activity.item.startsWith("/"))).toBe(false);
    expect(stats.activities.map((activity) => activity.user)).not.toContain("Leitura");
  });

  it("returns financial, commercial and department indicators from real query rows", async () => {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const query = dashboardQueryMock([], {
      certificateReceipts: [
        { month: currentMonth, paid_amount: "1234.50", unpaid_certificates: 2 },
      ],
      commercial: [
        {
          active_prospects: 4,
          closed_this_month: 1,
          financial_analysis: 2,
          scheduling: 1,
          proposal: 1,
          paused: 0,
          refused: 0,
          closed: 3,
        },
      ],
      commercialBilling: [{ pending: 5, contracted: 2, not_contracted: 1 }],
      departments: [
        { id: "dept-1", name: "Fiscal", open_tasks: 7, completed_tasks: 3, urgent_tasks: 2 },
      ],
    });
    const service = new DashboardStatsService({ pool: { query } as never });

    const stats = await service.getStats("org-1");

    expect(stats.financial).toMatchObject({
      paidCertificateReceipts: 1234.5,
      unpaidCertificates: 2,
    });
    expect(stats.commercial).toMatchObject({
      activeProspects: 4,
      closedThisMonth: 1,
      billing: { pending: 5, contracted: 2, notContracted: 1 },
    });
    expect(stats.departments).toEqual([
      { id: "dept-1", name: "Fiscal", openTasks: 7, completedTasks: 3, urgentTasks: 2 },
    ]);
    expect(stats).not.toHaveProperty("fiscal");
    expect(String(query.mock.calls[7]?.[0])).toContain('"certificate.pj"');
    expect(String(query.mock.calls[8]?.[0])).toContain('"commercial.prospecting"');
    expect(String(query.mock.calls[10]?.[0])).toContain("public.departments");
  });

  it("returns updatedAt from the latest real dashboard source timestamp", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce(
        result([
          {
            active_total: 10,
            contabil: 3,
            fiscal: 4,
            pessoal: 5,
            infoproduto: 0,
            consultoria: 0,
            castelo_med: 0,
          },
        ]),
      )
      .mockResolvedValueOnce(result([]))
      .mockResolvedValueOnce(result([]))
      .mockResolvedValueOnce(
        result([
          {
            today: 1,
            completed_today: 0,
            pending: 2,
            urgent: 1,
          },
        ]),
      )
      .mockResolvedValueOnce(result([]))
      .mockResolvedValueOnce(
        result([
          {
            active: 1,
            completed: 2,
            in_progress: 1,
            delayed: 0,
            waiting: 0,
          },
        ]),
      )
      .mockResolvedValueOnce(result([{ total: 0, pending: 0 }]))
      .mockResolvedValueOnce(result([]))
      .mockResolvedValueOnce(result([]))
      .mockResolvedValueOnce(result([]))
      .mockResolvedValueOnce(result([]))
      .mockResolvedValueOnce(result([]))
      .mockResolvedValueOnce(result([]))
      .mockResolvedValueOnce(result([{ updated_at: "2026-07-21T15:30:00.000Z" }]));

    const service = new DashboardStatsService({ pool: { query } as never });

    const stats = await service.getStats("org-1");

    expect(stats.updatedAt).toBe("2026-07-21T15:30:00.000Z");
  });

  it("does not use request audit or future scheduling fields as data update sources", () => {
    const source = readFileSync(new URL("./dashboardStatsService.ts", import.meta.url), "utf8");
    const updatedAtSql = source.slice(source.indexOf("const UPDATED_AT_SQL"));

    expect(updatedAtSql).not.toContain("public.audit_requests");
    expect(updatedAtSql).not.toContain("prevision_date");
    expect(updatedAtSql).toContain("updated_at <= current_timestamp");
  });
});
