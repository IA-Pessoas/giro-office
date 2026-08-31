import { createHash, createHmac } from "node:crypto";

import { pessoalUnionsReportingCatalog } from "@workspace/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PessoalUnionsAdapter } from "../integrations/pessoalUnionsAdapter.js";

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

const definition = {
  sources: ["pessoal.unions"],
  columns: [
    { source: "pessoal.unions", field: "name", alias: "name" },
    { source: "pessoal.unions", field: "base_date", alias: "base_date" },
  ],
  joins: [],
  filters: [],
  filter_groups: [],
  parameters: [],
  aggregations: [],
  order_by: [],
};

describe("PessoalUnionsAdapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("publica somente nome e data-base, limita a origem e assina pelo tenant", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        success: true,
        data: {
          rows: [{ name: "Sindicato A", base_date: "2026-05-01", id: "hidden-id" }],
          reachedLimit: true,
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new PessoalUnionsAdapter({
      pessoalServiceUrl: "http://pessoal.test",
      reportsInternalToken: "internal-token",
      reportsGrantSecret: "grant-secret",
      sourceTimeoutMs: 100,
    });

    expect(adapter.sources[0]?.fields.map((field) => field.key)).toEqual(["name", "base_date"]);
    expect(adapter.relations).toEqual([]);
    expect(pessoalUnionsReportingCatalog.sources[0]?.keys).toEqual([]);
    expect(JSON.stringify(adapter.sources)).not.toMatch(/id|cnpj/i);

    await expect(
      adapter.preview({
        definition,
        organization_id: "00000000-0000-4000-8000-000000000002",
        limit: 50_001,
        request_id: "request-846",
      }),
    ).resolves.toEqual({
      rows: [{ name: "Sindicato A", base_date: "2026-05-01" }],
      reachedLimit: true,
    });

    const [, request] = fetchMock.mock.calls[0] as [URL, RequestInit];
    const body = { source: "pessoal.unions", fields: ["name", "base_date"], limit: 101 };
    const grant = String((request.headers as Record<string, string>)["x-reports-grant"]);
    const payload = JSON.parse(Buffer.from(grant, "base64url").toString("utf8"));
    expect(new URL(fetchMock.mock.calls[0]?.[0] as URL).toString()).toBe(
      "http://pessoal.test/internal/reporting/extract",
    );
    expect(payload).toMatchObject({
      audience: "pessoal-service",
      operation: "extract",
      organization_id: "00000000-0000-4000-8000-000000000002",
      source: "pessoal.unions",
    });
    expect(payload.body_sha256).toBe(
      createHash("sha256").update(canonicalJson(body)).digest("hex"),
    );
    expect((request.headers as Record<string, string>)["x-reports-grant-signature"]).toBe(
      createHmac("sha256", "grant-secret").update(grant).digest("hex"),
    );
  });

  it("rejeita definição fora do recorte e resposta upstream sem expor conteúdo", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({ secret: "sensitive" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new PessoalUnionsAdapter({
      pessoalServiceUrl: "http://pessoal.test",
      reportsInternalToken: "internal-token",
      reportsGrantSecret: "grant-secret",
      sourceTimeoutMs: 100,
    });

    await expect(
      adapter.preview({
        definition: { ...definition, joins: [{ relation: "not-published" }] },
        organization_id: "00000000-0000-4000-8000-000000000002",
        limit: 1,
        request_id: "request-846",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      adapter.preview({
        definition,
        organization_id: "00000000-0000-4000-8000-000000000002",
        limit: 1,
        request_id: "request-846",
      }),
    ).rejects.toMatchObject({ statusCode: 503 });
    expect(JSON.stringify(fetchMock.mock.results)).not.toContain("sensitive");
  });
});
