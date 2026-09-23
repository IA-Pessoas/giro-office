import { createHash, createHmac } from "node:crypto";

import { tiInventoryReportingCatalog } from "@workspace/shared";
import { describe, expect, it, vi } from "vitest";

import { TiInventoryAdapter } from "../integrations/tiInventoryAdapter.js";

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

describe("TiInventoryAdapter", () => {
  it("publica somente campos seguros e assina a extração interna", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        success: true,
        data: {
          rows: [{ asset_code: "NB-001", category: "Notebook", user_id: "never-returned" }],
          reachedLimit: false,
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new TiInventoryAdapter({
      tiServiceUrl: "http://ti.test",
      reportsInternalToken: "reports-internal-token",
      reportsGrantSecret: "reports-grant-secret",
      sourceTimeoutMs: 100,
    });

    expect(adapter.sources[0]?.fields.map((field) => field.key)).toEqual([
      "asset_code",
      "category",
      "location",
      "delivery_date",
      "return_date",
      "notes",
    ]);
    expect(adapter.sources[0]).not.toHaveProperty("keys");
    expect(tiInventoryReportingCatalog.sources[0]?.keys.map((field) => field.key)).toEqual([
      "user_id",
      "location_id",
      "category_id",
      "responsible_it_staff_id",
    ]);

    await expect(
      adapter.preview({
        definition: {
          sources: ["ti.inventory"],
          columns: [
            { source: "ti.inventory", field: "asset_code", alias: "asset_code" },
            { source: "ti.inventory", field: "category", alias: "category" },
          ],
          joins: [],
          filters: [],
          filter_groups: [],
          parameters: [],
          aggregations: [],
          order_by: [],
        },
        organization_id: "10000000-0000-4000-8000-000000000001",
        limit: 102,
        request_id: "request-853",
      }),
    ).resolves.toEqual({
      rows: [{ asset_code: "NB-001", category: "Notebook" }],
      reachedLimit: false,
    });

    const [, request] = fetchMock.mock.calls[0] as [URL, RequestInit];
    const body = { source: "ti.inventory", fields: ["asset_code", "category"], limit: 102 };
    const grant = String((request.headers as Record<string, string>)["x-reports-grant"]);

    expect(new URL(fetchMock.mock.calls[0]?.[0] as URL).toString()).toBe(
      "http://ti.test/internal/reporting/extract",
    );
    expect(request.headers).toEqual(
      expect.objectContaining({
        "x-internal-service-token": "reports-internal-token",
        "x-request-id": "request-853",
      }),
    );
    expect((request.headers as Record<string, string>)["x-reports-grant-signature"]).toBe(
      createHmac("sha256", "reports-grant-secret").update(grant).digest("hex"),
    );
    expect(JSON.parse(Buffer.from(grant, "base64url").toString("utf8"))).toMatchObject({
      audience: "ti-service",
      organization_id: "10000000-0000-4000-8000-000000000001",
      source: "ti.inventory",
    });
    expect(JSON.parse(Buffer.from(grant, "base64url").toString("utf8")).body_sha256).toBe(
      createHash("sha256").update(canonicalJson(body)).digest("hex"),
    );
  });

  it("propaga reachedLimit e protege o caller de resposta interna inválida", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          success: true,
          data: { rows: [{ asset_code: "NB-001" }], reachedLimit: true },
        }),
      }),
    );
    const adapter = new TiInventoryAdapter({
      tiServiceUrl: "http://ti.test",
      reportsInternalToken: "reports-internal-token",
      reportsGrantSecret: "reports-grant-secret",
      sourceTimeoutMs: 100,
    });

    await expect(
      adapter.preview({
        definition: {
          sources: ["ti.inventory"],
          columns: [{ source: "ti.inventory", field: "asset_code", alias: "asset_code" }],
          joins: [],
          filters: [],
          filter_groups: [],
          parameters: [],
          aggregations: [],
          order_by: [],
        },
        organization_id: "10000000-0000-4000-8000-000000000001",
        limit: 101,
        request_id: "request-853",
      }),
    ).resolves.toEqual({ rows: [{ asset_code: "NB-001" }], reachedLimit: true });
  });
});
