import { createHash, createHmac } from "node:crypto";

import { rhAttendanceReportingCatalog } from "@workspace/shared";
import { describe, expect, it, vi } from "vitest";

import { RhAttendanceAdapter } from "../integrations/rhAttendanceAdapter.js";

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

describe("RhAttendanceAdapter", () => {
  it("publica campos seguros e assina extract interno", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        success: true,
        data: {
          rows: [{ clock_in: "2026-05-01T08:00:00.000Z", user_id: "nao-publicar" }],
          reachedLimit: false,
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new RhAttendanceAdapter({
      rhServiceUrl: "http://rh.test",
      reportsInternalToken: "internal-token",
      reportsGrantSecret: "grant-secret",
      sourceTimeoutMs: 100,
    });

    expect(adapter.sources[0]?.fields.map((field) => field.key)).toEqual(
      expect.arrayContaining([
        "clock_in",
        "workload_hours",
        "balance_minutes",
        "minutes",
        "status",
      ]),
    );
    expect(adapter.sources[0]?.keys).toBeUndefined();
    expect(rhAttendanceReportingCatalog.sources[0]?.keys.map((field) => field.key)).toEqual([
      "user_id",
      "point_id",
      "approver_user_id",
    ]);

    const definition = {
      sources: ["rh.attendance"],
      columns: [
        { source: "rh.attendance", field: "clock_in", alias: "clock_in" },
        { source: "rh.attendance", field: "status", alias: "status" },
      ],
      joins: [],
      filters: [],
      filter_groups: [],
      parameters: [],
      aggregations: [],
      order_by: [],
    };
    await expect(
      adapter.preview({
        definition,
        organization_id: "10000000-0000-0000-0000-000000000001",
        limit: 10,
        request_id: "request-851",
      }),
    ).resolves.toEqual({
      rows: [{ clock_in: "2026-05-01T08:00:00.000Z" }],
      reachedLimit: false,
    });

    const [, request] = fetchMock.mock.calls[0] as [URL, RequestInit];
    const body = { source: "rh.attendance", fields: ["clock_in", "status"], limit: 10 };
    const grant = String((request.headers as Record<string, string>)["x-reports-grant"]);
    expect((request.headers as Record<string, string>)["x-reports-grant-signature"]).toBe(
      createHmac("sha256", "grant-secret").update(grant).digest("hex"),
    );
    expect(JSON.parse(Buffer.from(grant, "base64url").toString("utf8"))).toMatchObject({
      organization_id: "10000000-0000-0000-0000-000000000001",
      source: "rh.attendance",
    });
    expect(JSON.parse(Buffer.from(grant, "base64url").toString("utf8")).body_sha256).toBe(
      createHash("sha256").update(canonicalJson(body)).digest("hex"),
    );
  });

  it("propaga reachedLimit e converte resposta upstream invalida em erro seguro", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        success: true,
        data: { rows: [{ minutes: 30 }], reachedLimit: true },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new RhAttendanceAdapter({
      rhServiceUrl: "http://rh.test",
      reportsInternalToken: "internal-token",
      reportsGrantSecret: "grant-secret",
      sourceTimeoutMs: 100,
    });

    await expect(
      adapter.preview({
        definition: {
          sources: ["rh.attendance"],
          columns: [{ source: "rh.attendance", field: "minutes", alias: "minutes" }],
          joins: [],
          filters: [],
          filter_groups: [],
          parameters: [],
          aggregations: [],
          order_by: [],
        },
        organization_id: "10000000-0000-0000-0000-000000000001",
        limit: 50001,
        request_id: "request-851",
      }),
    ).resolves.toEqual({ rows: [{ minutes: 30 }], reachedLimit: true });
    expect(JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body)).limit).toBe(101);
  });
});
