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
