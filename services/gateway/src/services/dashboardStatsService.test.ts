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

function dashboardQueryMock(activities: unknown[] = []) {
  return vi
    .fn()
    .mockResolvedValueOnce(
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
    )
    .mockResolvedValueOnce(result([]))
    .mockResolvedValueOnce(result([]))
    .mockResolvedValueOnce(result([{ today: 0, completed_today: 0, pending: 0, urgent: 0 }]))
    .mockResolvedValueOnce(result([]))
    .mockResolvedValueOnce(
      result([{ active: 0, completed: 0, in_progress: 0, delayed: 0, waiting: 0 }]),
    )
    .mockResolvedValueOnce(result([{ total: 0, pending: 0 }]))
    .mockResolvedValueOnce(result([]))
    .mockResolvedValueOnce(result(activities))
    .mockResolvedValueOnce(result([{ updated_at: null }]));
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

    for (let expectedCalls = 3; expectedCalls <= 10; expectedCalls += 1) {
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

    expect(query).toHaveBeenCalledTimes(10);
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
    await vi.waitFor(() => expect(query).toHaveBeenCalledTimes(10));
    await expect(service.getStats("org-1")).resolves.toBeDefined();

    expect(query).toHaveBeenCalledTimes(20);
  });

  it("limits the dashboard pool to the same number of concurrent queries", () => {
    const source = readFileSync(new URL("./dashboardStatsService.ts", import.meta.url), "utf8");

    expect(source).toContain("max: DASHBOARD_MAX_CONCURRENT_QUERIES");
  });

  it("returns semantic audit fields as friendly dashboard activity", async () => {
    const query = dashboardQueryMock([
      {
        user_name: "Davi",
        action: "consultou",
        method: "GET",
        item: "a lista de tarefas",
        path: "/task/list",
        created_at: new Date(),
      },
    ]);
    const service = new DashboardStatsService({ pool: { query } as never });

    const stats = await service.getStats("org-1");

    expect(stats.activities[0]).toMatchObject({
      user: "Davi",
      action: "consultou",
      item: "a lista de tarefas",
    });
  });

  it("filters new technical and unsuccessful events while keeping legacy rows eligible", async () => {
    const query = dashboardQueryMock();
    const service = new DashboardStatsService({ pool: { query } as never });

    await service.getStats("org-1");

    const activitiesSql = String(query.mock.calls[8]?.[0]);
    expect(activitiesSql).toContain("not coalesce(a.metadata_json ? 'activityVisible', false)");
    expect(activitiesSql).toContain("a.metadata_json @> '{\"activityVisible\": true}'::jsonb");
    expect(activitiesSql).toContain("a.outcome = 'success'");
    expect(activitiesSql).toContain("order by a.created_at desc");
    expect(activitiesSql).toContain("limit 5");
  });

  it("defends the activity feed against unfiltered query rows", async () => {
    const query = dashboardQueryMock([
      {
        user_name: "Legado",
        action: "consultou",
        method: "GET",
        item: "a lista de tarefas",
        path: "/task/list",
        created_at: new Date(),
        outcome: "error",
        activity_visible: null,
      },
      {
        user_name: "Sucesso",
        action: "consultou",
        method: "GET",
        item: "a lista de tarefas",
        path: "/task/list",
        created_at: new Date(),
        outcome: "success",
        activity_visible: true,
      },
      {
        user_name: "Erro",
        action: "consultou",
        method: "GET",
        item: "a lista de tarefas",
        path: "/task/list",
        created_at: new Date(),
        outcome: "error",
        activity_visible: true,
      },
      {
        user_name: "Abortado",
        action: "consultou",
        method: "GET",
        item: "a lista de tarefas",
        path: "/task/list",
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
