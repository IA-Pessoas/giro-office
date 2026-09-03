import { createHash, createHmac } from "node:crypto";

import { pessoalLddReportingCatalog } from "@workspace/shared";
import { describe, expect, it, vi } from "vitest";

import { PessoalLddAdapter } from "../integrations/pessoalLddAdapter.js";

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

describe("PessoalLddAdapter", () => {
  it("publica campos seguros, limita a origem e assina o extract interno", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        success: true,
        data: { rows: [{ type: "FGTS", id: "hidden-id" }], reachedLimit: false },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new PessoalLddAdapter({
      pessoalServiceUrl: "http://pessoal.test",
      reportsInternalToken: "internal-token",
      reportsGrantSecret: "grant-secret",
      sourceTimeoutMs: 100,
    });

    expect(adapter.sources[0]?.fields.map((field) => field.key)).toEqual([
      "type",
      "period",
      "due_date",
      "balance_amount",
      "registration_status",
      "status",
    ]);
    expect(adapter.sources[0]?.fields.map((field) => field.key)).not.toContain("id");
    expect(pessoalLddReportingCatalog.sources[0]?.keys.map((field) => field.key)).toEqual([
      "client_id",
    ]);
    expect(adapter.relations).toEqual([]);

    await expect(
      adapter.preview({
        definition: {
          sources: ["pessoal.ldd"],
          columns: [{ source: "pessoal.ldd", field: "type", alias: "type" }],
          joins: [],
          filters: [],
          filter_groups: [],
          parameters: [],
          aggregations: [],
          order_by: [],
        },
        organization_id: "00000000-0000-4000-8000-000000000002",
        limit: 50_001,
        request_id: "request-842",
      }),
    ).resolves.toEqual([{ type: "FGTS" }]);

    const [, request] = fetchMock.mock.calls[0] as [URL, RequestInit];
    const body = { source: "pessoal.ldd", fields: ["type"], limit: 101 };
    expect(new URL(fetchMock.mock.calls[0]?.[0] as URL).toString()).toBe(
      "http://pessoal.test/internal/reporting/extract",
    );
    expect(request.headers).toEqual(
      expect.objectContaining({
        "x-internal-service-token": "internal-token",
        "x-request-id": "request-842",
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
    const adapter = new PessoalLddAdapter({
      pessoalServiceUrl: "http://pessoal.test",
      reportsInternalToken: "internal-token",
      reportsGrantSecret: "grant-secret",
      sourceTimeoutMs: 100,
    });

    await expect(
      adapter.preview({
        definition: {
          sources: ["pessoal.ldd"],
          columns: [{ source: "pessoal.ldd", field: "type", alias: "type" }],
          joins: [],
          filters: [],
          filter_groups: [],
          parameters: [],
          aggregations: [],
          order_by: [],
        },
        organization_id: "00000000-0000-4000-8000-000000000002",
        limit: 10,
        request_id: "request-842",
      }),
    ).rejects.toMatchObject({ statusCode: 503 });
  });
});
