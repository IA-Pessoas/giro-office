import { createHash, createHmac } from "node:crypto";

import { tiRequestsReportingCatalog } from "@workspace/shared";
import { describe, expect, it, vi } from "vitest";

import { TiRequestsAdapter } from "../integrations/tiRequestsAdapter.js";

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

describe("TiRequestsAdapter", () => {
  it("publica somente campos seguros e assina a extração interna", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        success: true,
        data: {
          rows: [
            { title: "Notebook sem conexão", category: "Rede", description: "never-returned" },
          ],
          reachedLimit: false,
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new TiRequestsAdapter({
      tiServiceUrl: "http://ti.test",
      reportsInternalToken: "reports-internal-token",
      reportsGrantSecret: "reports-grant-secret",
      sourceTimeoutMs: 100,
    });

    expect(adapter.sources[0]?.fields.map((field) => field.key)).toEqual([
      "title",
      "category",
      "urgency",
      "status",
      "created_at",
      "updated_at",
    ]);
    expect(adapter.sources[0]).not.toHaveProperty("keys");
    expect(tiRequestsReportingCatalog.sources[0]?.keys.map((field) => field.key)).toEqual([
      "requester_id",
      "assigned_to_id",
    ]);

    await expect(
      adapter.preview({
        definition: {
          sources: ["ti.requests"],
          columns: [
            { source: "ti.requests", field: "title", alias: "title" },
            { source: "ti.requests", field: "category", alias: "category" },
          ],
          joins: [],
          filters: [],
          filter_groups: [],
          parameters: [],
          aggregations: [],
          order_by: [],
        },
        organization_id: "10000000-0000-4000-8000-000000000001",
        limit: 10,
        request_id: "request-855",
      }),
    ).resolves.toEqual({
      rows: [{ title: "Notebook sem conexão", category: "Rede" }],
      reachedLimit: false,
    });

    const [, request] = fetchMock.mock.calls[0] as [URL, RequestInit];
    const body = { source: "ti.requests", fields: ["title", "category"], limit: 10 };
    const grant = String((request.headers as Record<string, string>)["x-reports-grant"]);

    expect(new URL(fetchMock.mock.calls[0]?.[0] as URL).toString()).toBe(
      "http://ti.test/internal/reporting/extract",
    );
    expect(request.headers).toEqual(
      expect.objectContaining({
        "x-internal-service-token": "reports-internal-token",
        "x-request-id": "request-855",
      }),
    );
    expect((request.headers as Record<string, string>)["x-reports-grant-signature"]).toBe(
      createHmac("sha256", "reports-grant-secret").update(grant).digest("hex"),
    );
    expect(JSON.parse(Buffer.from(grant, "base64url").toString("utf8"))).toMatchObject({
      audience: "ti-service",
      organization_id: "10000000-0000-4000-8000-000000000001",
      source: "ti.requests",
    });
    expect(JSON.parse(Buffer.from(grant, "base64url").toString("utf8")).body_sha256).toBe(
      createHash("sha256").update(canonicalJson(body)).digest("hex"),
    );
  });

  it("limita a consulta interna e converte falhas do upstream em erro seguro", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        success: true,
        data: { rows: [{ title: "Chamado" }], reachedLimit: true },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new TiRequestsAdapter({
      tiServiceUrl: "http://ti.test",
      reportsInternalToken: "reports-internal-token",
      reportsGrantSecret: "reports-grant-secret",
      sourceTimeoutMs: 100,
    });

    await expect(
      adapter.preview({
        definition: {
          sources: ["ti.requests"],
          columns: [{ source: "ti.requests", field: "title", alias: "title" }],
          joins: [],
          filters: [],
          filter_groups: [],
          parameters: [],
          aggregations: [],
          order_by: [],
        },
        organization_id: "10000000-0000-4000-8000-000000000001",
        limit: 999,
        request_id: "request-855",
      }),
    ).resolves.toEqual({ rows: [{ title: "Chamado" }], reachedLimit: true });

    const [, request] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(JSON.parse(String(request.body))).toEqual({
      source: "ti.requests",
      fields: ["title"],
      limit: 101,
    });
  });
});
