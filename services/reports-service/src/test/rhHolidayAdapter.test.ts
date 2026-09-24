import { createHash, createHmac } from "node:crypto";

import {
  MAX_REPORTING_QUERY_LIMIT,
  REPORTING_QUERY_BYTE_LIMIT_CODE,
  rhHolidayReportingCatalog,
} from "@workspace/shared";
import { describe, expect, it, vi } from "vitest";

import { RhHolidayAdapter } from "../integrations/rhHolidayAdapter.js";

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

describe("RhHolidayAdapter", () => {
  it("publica apenas nome e data, assina o extract e preserva reachedLimit", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        success: true,
        data: {
          rows: [{ name: "Feriado municipal", date: "2026-09-07", id: "nao-publicar" }],
          reachedLimit: true,
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new RhHolidayAdapter({
      rhServiceUrl: "http://rh.test",
      reportsInternalToken: "internal-token",
      reportsGrantSecret: "grant-secret",
      sourceTimeoutMs: 100,
    });

    expect(adapter.sources[0]?.keys).toBeUndefined();
    expect(adapter.sources[0]?.fields.map((field) => field.key)).toEqual(["name", "date"]);
    expect(rhHolidayReportingCatalog.sources[0]?.keys).toEqual([]);

    await expect(
      adapter.preview({
        definition: {
          sources: ["rh.holidays"],
          columns: [
            { source: "rh.holidays", field: "name", alias: "name" },
            { source: "rh.holidays", field: "date", alias: "date" },
          ],
          joins: [],
          filters: [],
          filter_groups: [],
          parameters: [],
          aggregations: [],
          order_by: [],
        },
        organization_id: "10000000-0000-0000-0000-000000000001",
        limit: 50_001,
        request_id: "request-852",
      }),
    ).resolves.toEqual({
      rows: [{ name: "Feriado municipal", date: "2026-09-07" }],
      reachedLimit: true,
    });

    const [, request] = fetchMock.mock.calls[0] as [URL, RequestInit];
    const body = {
      source: "rh.holidays",
      fields: ["name", "date"],
      limit: MAX_REPORTING_QUERY_LIMIT,
    };
    expect(new URL(fetchMock.mock.calls[0]?.[0] as URL).toString()).toBe(
      "http://rh.test/internal/reporting/extract",
    );
    const grant = String((request.headers as Record<string, string>)["x-reports-grant"]);
    expect((request.headers as Record<string, string>)["x-reports-grant-signature"]).toBe(
      createHmac("sha256", "grant-secret").update(grant).digest("hex"),
    );
    expect(JSON.parse(Buffer.from(grant, "base64url").toString("utf8"))).toMatchObject({
      audience: "rh-service",
      organization_id: "10000000-0000-0000-0000-000000000001",
      source: "rh.holidays",
    });
    expect(JSON.parse(Buffer.from(grant, "base64url").toString("utf8")).body_sha256).toBe(
      createHash("sha256").update(canonicalJson(body)).digest("hex"),
    );
  });

  it("não propaga conteúdo nem erro do upstream", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({ ok: false, json: vi.fn().mockResolvedValue({ secret: "hidden" }) }),
    );
    const adapter = new RhHolidayAdapter({
      rhServiceUrl: "http://rh.test",
      reportsInternalToken: "internal-token",
      reportsGrantSecret: "grant-secret",
      sourceTimeoutMs: 100,
    });

    await expect(
      adapter.preview({
        definition: {
          sources: ["rh.holidays"],
          columns: [{ source: "rh.holidays", field: "name", alias: "name" }],
          joins: [],
          filters: [],
          filter_groups: [],
          parameters: [],
          aggregations: [],
          order_by: [],
        },
        organization_id: "10000000-0000-0000-0000-000000000001",
        limit: 10,
        request_id: "request-852",
      }),
    ).rejects.toMatchObject({ statusCode: 503 });
  });

  it("mapeia o limite global de bytes para um erro acionável", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: vi.fn().mockResolvedValue({ code: REPORTING_QUERY_BYTE_LIMIT_CODE }),
      }),
    );
    const adapter = new RhHolidayAdapter({
      rhServiceUrl: "http://rh.test",
      reportsInternalToken: "internal-token",
      reportsGrantSecret: "grant-secret",
      sourceTimeoutMs: 100,
    });

    await expect(
      adapter.preview({
        definition: {
          sources: ["rh.holidays"],
          columns: [{ source: "rh.holidays", field: "name", alias: "name" }],
          joins: [],
          filters: [],
          filter_groups: [],
          parameters: [],
          aggregations: [],
          order_by: [],
        },
        organization_id: "10000000-0000-0000-0000-000000000001",
        limit: MAX_REPORTING_QUERY_LIMIT,
        request_id: "request-852",
      }),
    ).rejects.toMatchObject({
      statusCode: 422,
      message: expect.stringContaining("limite global"),
    });
  });
});
