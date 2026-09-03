import { createHash, createHmac } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { FiscalIcmsAdapter } from "../integrations/fiscalIcmsAdapter.js";

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

describe("FiscalIcmsAdapter", () => {
  it("publica somente campos seguros e assina o extract interno", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        success: true,
        data: { rows: [{ state: "SP" }], reachedLimit: false },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new FiscalIcmsAdapter({
      fiscalServiceUrl: "http://fiscal.test",
      reportsInternalToken: "internal-token",
      reportsGrantSecret: "grant-secret",
      sourceTimeoutMs: 100,
    });

    expect(adapter.sources[0]?.fields.map((field) => field.key)).toEqual(
      expect.arrayContaining([
        "state",
        "item_number",
        "cest_code",
        "description",
        "interstate_agreement",
        "applied_original_mva",
        "adjusted_mva",
        "original_mva",
      ]),
    );
    expect(adapter.sources[0]?.fields.map((field) => field.key)).not.toContain("id");
    expect(adapter.sources[0]?.keys).toBeUndefined();

    await expect(
      adapter.preview({
        definition: {
          sources: ["fiscal.icms"],
          columns: [{ source: "fiscal.icms", field: "state", alias: "state" }],
          joins: [],
          filters: [],
          filter_groups: [],
          parameters: [],
          aggregations: [],
          order_by: [],
        },
        organization_id: "a0000000-0000-4000-8000-000000000001",
        limit: 50_001,
        request_id: "request-840",
      }),
    ).resolves.toEqual([{ state: "SP" }]);

    const [, request] = fetchMock.mock.calls[0] as [URL, RequestInit];
    const body = { source: "fiscal.icms", fields: ["state"], limit: 101 };
    expect(new URL(fetchMock.mock.calls[0]?.[0] as URL).toString()).toBe(
      "http://fiscal.test/internal/reporting/extract",
    );
    expect(request.headers).toEqual(
      expect.objectContaining({
        "x-internal-service-token": "internal-token",
        "x-request-id": "request-840",
      }),
    );
    const grant = String((request.headers as Record<string, string>)["x-reports-grant"]);
    expect((request.headers as Record<string, string>)["x-reports-grant-signature"]).toBe(
      createHmac("sha256", "grant-secret").update(grant).digest("hex"),
    );
    expect(JSON.parse(Buffer.from(grant, "base64url").toString("utf8")).body_sha256).toBe(
      createHash("sha256").update(canonicalJson(body)).digest("hex"),
    );
  });

  it("converte resposta upstream inválida em erro seguro", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, json: vi.fn().mockResolvedValue({}) }),
    );
    const adapter = new FiscalIcmsAdapter({
      fiscalServiceUrl: "http://fiscal.test",
      reportsInternalToken: "internal-token",
      reportsGrantSecret: "grant-secret",
      sourceTimeoutMs: 100,
    });

    await expect(
      adapter.preview({
        definition: {
          sources: ["fiscal.icms"],
          columns: [{ source: "fiscal.icms", field: "state", alias: "state" }],
          joins: [],
          filters: [],
          filter_groups: [],
          parameters: [],
          aggregations: [],
          order_by: [],
        },
        organization_id: "a0000000-0000-4000-8000-000000000001",
        limit: 10,
        request_id: "request-840",
      }),
    ).rejects.toMatchObject({ statusCode: 503 });
  });
});
