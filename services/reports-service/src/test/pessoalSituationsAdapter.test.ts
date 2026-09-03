import { createHash, createHmac } from "node:crypto";

import { pessoalSituationsReportingCatalog } from "@workspace/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PessoalSituationsAdapter } from "../integrations/pessoalSituationsAdapter.js";

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
  sources: ["pessoal.situations"],
  columns: [
    { source: "pessoal.situations", field: "status", alias: "status" },
    { source: "pessoal.situations", field: "title", alias: "title" },
  ],
  joins: [],
  filters: [],
  filter_groups: [],
  parameters: [],
  aggregations: [],
  order_by: [],
};

describe("PessoalSituationsAdapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("publica campos seguros, limita a origem e assina o extract por organização", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        success: true,
        data: {
          rows: [{ status: "Finalizado", title: "Folha", id: "hidden-id" }],
          reachedLimit: true,
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new PessoalSituationsAdapter({
      pessoalServiceUrl: "http://pessoal.test",
      reportsInternalToken: "internal-token",
      reportsGrantSecret: "grant-secret",
      sourceTimeoutMs: 100,
    });

    expect(adapter.sources[0]?.fields.map((field) => field.key)).toEqual([
      "status",
      "title",
      "registration_date",
      "completion_date",
    ]);
    expect(adapter.sources[0]).not.toHaveProperty("keys");
    expect(adapter.sources[0]?.fields.map((field) => field.key)).not.toContain("id");
    expect(pessoalSituationsReportingCatalog.sources[0]?.keys.map((field) => field.key)).toEqual([
      "client_id",
      "registered_by_id",
      "completed_by_id",
    ]);

    await expect(
      adapter.preview({
        definition,
        organization_id: "00000000-0000-4000-8000-000000000002",
        limit: 50_001,
        request_id: "request-845",
      }),
    ).resolves.toEqual({
      rows: [{ status: "Finalizado", title: "Folha" }],
      reachedLimit: true,
    });

    const [, request] = fetchMock.mock.calls[0] as [URL, RequestInit];
    const body = {
      source: "pessoal.situations",
      fields: ["status", "title"],
      limit: 101,
    };
    expect(new URL(fetchMock.mock.calls[0]?.[0] as URL).toString()).toBe(
      "http://pessoal.test/internal/reporting/extract",
    );
    expect(request.headers).toEqual(
      expect.objectContaining({
        "x-internal-service-token": "internal-token",
        "x-request-id": "request-845",
      }),
    );
    const grant = String((request.headers as Record<string, string>)["x-reports-grant"]);
    const payload = JSON.parse(Buffer.from(grant, "base64url").toString("utf8"));
    expect(payload).toMatchObject({
      audience: "pessoal-service",
      operation: "extract",
      organization_id: "00000000-0000-4000-8000-000000000002",
      source: "pessoal.situations",
    });
    expect((request.headers as Record<string, string>)["x-reports-grant-signature"]).toBe(
      createHmac("sha256", "grant-secret").update(grant).digest("hex"),
    );
    expect(payload.body_sha256).toBe(
      createHash("sha256").update(canonicalJson(body)).digest("hex"),
    );
  });

  it("rejeita filtros e respostas upstream inválidas sem expor conteúdo sensível", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({ secret: "sensitive" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new PessoalSituationsAdapter({
      pessoalServiceUrl: "http://pessoal.test",
      reportsInternalToken: "internal-token",
      reportsGrantSecret: "grant-secret",
      sourceTimeoutMs: 100,
    });

    await expect(
      adapter.preview({
        definition: {
          ...definition,
          filters: [
            {
              source: "pessoal.situations",
              field: "status",
              operator: "eq",
              parameter: "Finalizado",
            },
          ],
        },
        organization_id: "00000000-0000-4000-8000-000000000002",
        limit: 10,
        request_id: "request-845",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });

    await expect(
      adapter.preview({
        definition,
        organization_id: "00000000-0000-4000-8000-000000000002",
        limit: 10,
        request_id: "request-845",
      }),
    ).rejects.toMatchObject({ statusCode: 503 });
    expect(JSON.stringify(fetchMock.mock.results)).not.toContain("sensitive");
  });
});
