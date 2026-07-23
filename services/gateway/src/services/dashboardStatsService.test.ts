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

describe("DashboardStatsService", () => {
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
