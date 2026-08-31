import { createHash, createHmac } from "node:crypto";

import { tiStockReportingCatalog } from "@workspace/shared";
import { describe, expect, it, vi } from "vitest";

import { TiStockAdapter } from "../integrations/tiStockAdapter.js";

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

describe("TiStockAdapter", () => {
  it("publica campos seguros, omite keys internas e assina a extração", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        success: true,
        data: {
          rows: [{ name: "Notebook", category: "Hardware", id: "nao-publicar" }],
          reachedLimit: false,
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new TiStockAdapter({
      tiServiceUrl: "http://ti.test",
      reportsInternalToken: "internal-token",
      reportsGrantSecret: "grant-secret",
      sourceTimeoutMs: 100,
    });

    expect(adapter.sources[0]?.fields.map((field) => field.key)).toEqual([
      "name",
      "category",
      "location",
      "quantity",
      "description",
      "status",
    ]);
    expect(adapter.sources[0]?.keys).toBeUndefined();
    expect(tiStockReportingCatalog.sources[0]?.keys.map((field) => field.key)).toEqual([
      "department_id",
      "category_id",
      "location_id",
    ]);

    const bodyDefinition = {
      sources: ["ti.stock"],
      columns: [
        { source: "ti.stock", field: "name", alias: "name" },
        { source: "ti.stock", field: "category", alias: "category" },
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
        definition: bodyDefinition,
        organization_id: "10000000-0000-0000-0000-000000000001",
        limit: 10,
        request_id: "request-ti-stock",
      }),
    ).resolves.toEqual({
      rows: [{ name: "Notebook", category: "Hardware" }],
      reachedLimit: false,
    });

    const [, requestInit] = fetchMock.mock.calls[0] as [URL, RequestInit];
    const body = { source: "ti.stock", fields: ["name", "category"], limit: 10 };
    expect(new URL(fetchMock.mock.calls[0]?.[0] as URL).toString()).toBe(
      "http://ti.test/internal/reporting/extract",
    );
    const headers = requestInit.headers as Record<string, string>;
    const grant = headers["x-reports-grant"];
    expect(headers).toEqual(
      expect.objectContaining({
        "x-internal-service-token": "internal-token",
        "x-request-id": "request-ti-stock",
      }),
    );
    expect(headers["x-reports-grant-signature"]).toBe(
      createHmac("sha256", "grant-secret").update(grant).digest("hex"),
    );
    expect(JSON.parse(Buffer.from(grant, "base64url").toString("utf8"))).toMatchObject({
      audience: "ti-service",
      organization_id: "10000000-0000-0000-0000-000000000001",
      source: "ti.stock",
    });
    expect(JSON.parse(Buffer.from(grant, "base64url").toString("utf8")).body_sha256).toBe(
      createHash("sha256").update(canonicalJson(body)).digest("hex"),
    );
  });

  it("converte resposta upstream inválida em erro seguro", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({ ok: false, json: vi.fn().mockResolvedValue({ secret: "hidden" }) }),
    );
    const adapter = new TiStockAdapter({
      tiServiceUrl: "http://ti.test",
      reportsInternalToken: "internal-token",
      reportsGrantSecret: "grant-secret",
      sourceTimeoutMs: 100,
    });

    await expect(
      adapter.preview({
        definition: {
          sources: ["ti.stock"],
          columns: [{ source: "ti.stock", field: "name", alias: "name" }],
          joins: [],
          filters: [],
          filter_groups: [],
          parameters: [],
          aggregations: [],
          order_by: [],
        },
        organization_id: "10000000-0000-0000-0000-000000000001",
        limit: 10,
        request_id: "request-ti-stock",
      }),
    ).rejects.toMatchObject({ statusCode: 503 });
  });
});
