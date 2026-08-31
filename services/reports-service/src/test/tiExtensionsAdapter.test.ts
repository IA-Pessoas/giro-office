import { createHash, createHmac } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { TiExtensionsAdapter } from "../integrations/tiExtensionsAdapter.js";

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

describe("TiExtensionsAdapter", () => {
  it("publica campos seguros, assina a extração e preserva o corte da origem", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        success: true,
        data: { rows: [{ number: "1234", user_id: "never-returned" }], reachedLimit: true },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new TiExtensionsAdapter({
      tiServiceUrl: "http://ti.test",
      reportsInternalToken: "reports-internal-token",
      reportsGrantSecret: "reports-grant-secret",
      sourceTimeoutMs: 100,
    });

    expect(adapter.sources[0]?.fields.map((field) => field.key)).toEqual([
      "number",
      "created_at",
      "updated_at",
    ]);
    expect(adapter.sources[0]).not.toHaveProperty("keys");

    await expect(
      adapter.preview({
        definition: {
          sources: ["ti.extensions"],
          columns: [{ source: "ti.extensions", field: "number", alias: "ramal" }],
          joins: [],
          filters: [],
          filter_groups: [],
          parameters: [],
          aggregations: [],
          order_by: [],
        },
        organization_id: "10000000-0000-4000-8000-000000000001",
        limit: 10,
        request_id: "request-856",
      }),
    ).resolves.toEqual({ rows: [{ number: "1234" }], reachedLimit: true });

    const [, request] = fetchMock.mock.calls[0] as [URL, RequestInit];
    const body = { source: "ti.extensions", fields: ["number"], limit: 10 };
    const grant = String((request.headers as Record<string, string>)["x-reports-grant"]);

    expect(new URL(fetchMock.mock.calls[0]?.[0] as URL).toString()).toBe(
      "http://ti.test/internal/reporting/extract",
    );
    expect((request.headers as Record<string, string>)["x-reports-grant-signature"]).toBe(
      createHmac("sha256", "reports-grant-secret").update(grant).digest("hex"),
    );
    expect(JSON.parse(Buffer.from(grant, "base64url").toString("utf8"))).toMatchObject({
      audience: "ti-service",
      organization_id: "10000000-0000-4000-8000-000000000001",
      source: "ti.extensions",
    });
    expect(JSON.parse(Buffer.from(grant, "base64url").toString("utf8")).body_sha256).toBe(
      createHash("sha256").update(canonicalJson(body)).digest("hex"),
    );
  });
});
