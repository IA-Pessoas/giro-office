import { createHash, createHmac } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { ContabilControlAdapter } from "../integrations/contabilControlAdapter.js";
import { ContabilResponsiblesAdapter } from "../integrations/contabilResponsiblesAdapter.js";

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

describe("ContabilControlAdapter", () => {
  it("publica campos seguros e assina extract interno", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        success: true,
        data: { rows: [{ competence: "2026-01", monthly_closing: true }], reachedLimit: true },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new ContabilControlAdapter({
      contabilServiceUrl: "http://contabil.test",
      reportsInternalToken: "internal-token",
      reportsGrantSecret: "grant-secret",
      sourceTimeoutMs: 100,
    });

    expect(adapter.sources[0]?.fields.map((field) => field.key)).toEqual(
      expect.arrayContaining(["competence", "monthly_closing", "reconcile_bank_statements"]),
    );
    expect(adapter.sources[0]?.fields.map((field) => field.key)).not.toEqual(
      expect.arrayContaining(["client_id", "id", "notes"]),
    );

    await expect(
      adapter.preview({
        definition: {
          sources: ["contabil.control"],
          columns: [
            { source: "contabil.control", field: "competence", alias: "competence" },
            { source: "contabil.control", field: "monthly_closing", alias: "monthly_closing" },
          ],
          joins: [],
          filters: [],
          filter_groups: [],
          parameters: [],
          aggregations: [],
          order_by: [],
        },
        organization_id: "00000000-0000-4000-8000-000000000001",
        limit: 10,
        request_id: "request-834",
      }),
    ).resolves.toEqual({
      rows: [{ competence: "2026-01", monthly_closing: true }],
      reachedLimit: true,
    });

    const [, request] = fetchMock.mock.calls[0] as [URL, RequestInit];
    const body = {
      source: "contabil.control",
      fields: ["competence", "monthly_closing"],
      limit: 10,
    };
    expect(new URL(fetchMock.mock.calls[0]?.[0] as URL).toString()).toBe(
      "http://contabil.test/internal/reporting/extract",
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
    const adapter = new ContabilControlAdapter({
      contabilServiceUrl: "http://contabil.test",
      reportsInternalToken: "internal-token",
      reportsGrantSecret: "grant-secret",
      sourceTimeoutMs: 100,
    });

    await expect(
      adapter.preview({
        definition: {
          sources: ["contabil.control"],
          columns: [{ source: "contabil.control", field: "competence", alias: "competence" }],
          joins: [],
          filters: [],
          filter_groups: [],
          parameters: [],
          aggregations: [],
          order_by: [],
        },
        organization_id: "00000000-0000-4000-8000-000000000001",
        limit: 10,
        request_id: "request-834",
      }),
    ).rejects.toMatchObject({ statusCode: 503 });
  });

  it("assina a extração de responsáveis sem enviar chaves internas", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        success: true,
        data: { rows: [{ customer_with_movement: true }], reachedLimit: true },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new ContabilResponsiblesAdapter({
      contabilServiceUrl: "http://contabil.test",
      reportsInternalToken: "internal-token",
      reportsGrantSecret: "grant-secret",
      sourceTimeoutMs: 100,
    });

    await expect(
      adapter.preview({
        definition: {
          sources: ["contabil.responsibles"],
          columns: [
            {
              source: "contabil.responsibles",
              field: "customer_with_movement",
              alias: "customer_with_movement",
            },
          ],
          joins: [],
          filters: [],
          filter_groups: [],
          parameters: [],
          aggregations: [],
          order_by: [],
        },
        organization_id: "00000000-0000-4000-8000-000000000001",
        limit: 10,
        request_id: "request-835",
      }),
    ).resolves.toEqual({
      rows: [{ customer_with_movement: true }],
      reachedLimit: true,
    });

    const [, request] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(JSON.parse(String(request.body))).toEqual({
      source: "contabil.responsibles",
      fields: ["customer_with_movement"],
      limit: 10,
    });
  });
});
