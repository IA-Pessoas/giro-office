import { createHash, createHmac } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { FiscalNcmAdapter } from "../integrations/fiscalNcmAdapter.js";

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

describe("FiscalNcmAdapter", () => {
  it("publica somente campos seguros e assina o extract interno", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        success: true,
        data: { rows: [{ ncm_code: "84719012" }], reachedLimit: false },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new FiscalNcmAdapter({
      fiscalServiceUrl: "http://fiscal.test",
      reportsInternalToken: "internal-token",
      reportsGrantSecret: "grant-secret",
      sourceTimeoutMs: 100,
    });

    expect(adapter.sources[0]?.fields.map((field) => field.key)).toEqual(
      expect.arrayContaining([
        "tax_regime",
        "ncm_code",
        "federal_taxation_type",
        "cst_pis_outgoing",
        "cst_cofins_outgoing",
        "product_group",
        "description",
        "validity_start_date",
        "validity_end_date",
      ]),
    );
    expect(adapter.sources[0]?.fields.map((field) => field.key)).not.toContain("id");
    expect(adapter.sources[0]?.keys).toBeUndefined();

    await expect(
      adapter.preview({
        definition: {
          sources: ["fiscal.ncm"],
          columns: [{ source: "fiscal.ncm", field: "ncm_code", alias: "ncm_code" }],
          joins: [],
          filters: [],
          filter_groups: [],
          parameters: [],
          aggregations: [],
          order_by: [],
        },
        organization_id: "a0000000-0000-4000-8000-000000000001",
        limit: 50_001,
        request_id: "request-839",
      }),
    ).resolves.toEqual([{ ncm_code: "84719012" }]);

    const [, request] = fetchMock.mock.calls[0] as [URL, RequestInit];
    const body = { source: "fiscal.ncm", fields: ["ncm_code"], limit: 50_001 };
    expect(new URL(fetchMock.mock.calls[0]?.[0] as URL).toString()).toBe(
      "http://fiscal.test/internal/reporting/extract",
    );
    expect(request.headers).toEqual(
      expect.objectContaining({
        "x-internal-service-token": "internal-token",
        "x-request-id": "request-839",
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
    const adapter = new FiscalNcmAdapter({
      fiscalServiceUrl: "http://fiscal.test",
      reportsInternalToken: "internal-token",
      reportsGrantSecret: "grant-secret",
      sourceTimeoutMs: 100,
    });

    await expect(
      adapter.preview({
        definition: {
          sources: ["fiscal.ncm"],
          columns: [{ source: "fiscal.ncm", field: "ncm_code", alias: "ncm_code" }],
          joins: [],
          filters: [],
          filter_groups: [],
          parameters: [],
          aggregations: [],
          order_by: [],
        },
        organization_id: "a0000000-0000-4000-8000-000000000001",
        limit: 10,
        request_id: "request-839",
      }),
    ).rejects.toMatchObject({ statusCode: 503 });
  });
});
