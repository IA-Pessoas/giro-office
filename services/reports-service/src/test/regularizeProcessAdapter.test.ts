import { createHash, createHmac } from "node:crypto";

import { regularizeProcessReportingCatalog } from "@workspace/shared";
import { describe, expect, it, vi } from "vitest";

import { RegularizeProcessAdapter } from "../integrations/regularizeProcessAdapter.js";

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

describe("RegularizeProcessAdapter", () => {
  it("publica campos seguros, mantém chaves internas fora do catálogo e assina o extract", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        success: true,
        data: {
          rows: [
            {
              process_type: "Abertura",
              status: "Aberto",
              id: "nao-publicar",
              cpf_cnpj: "nao-publicar",
              client_pf_id: "nao-publicar",
            },
          ],
          reachedLimit: true,
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new RegularizeProcessAdapter({
      regularizeServiceUrl: "http://regularize.test",
      regularizeReportingToken: "regularize-reporting-token",
      regularizeReportingGrantSecret: "regularize-reporting-secret",
      sourceTimeoutMs: 100,
    });

    expect(adapter.sources[0]?.fields.map((field) => field.key)).toEqual([
      "process_type",
      "entry_date",
      "completion_date",
      "expected_date",
      "status",
      "locking_type",
      "urgency",
    ]);
    expect(adapter.sources[0]?.keys).toBeUndefined();
    expect(regularizeProcessReportingCatalog.sources[0]?.keys.map((field) => field.key)).toEqual([
      "client_pj_id",
      "client_pf_id",
      "responsible1_id",
      "responsible2_id",
      "responsible3_id",
      "task_id",
    ]);

    const body = {
      source: "regularize.processes",
      fields: ["process_type", "status"],
      limit: 10,
    };
    await expect(
      adapter.preview({
        definition: {
          sources: ["regularize.processes"],
          columns: [
            { source: "regularize.processes", field: "process_type", alias: "process_type" },
            { source: "regularize.processes", field: "status", alias: "status" },
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
        request_id: "request-848",
      }),
    ).resolves.toEqual({
      rows: [{ process_type: "Abertura", status: "Aberto" }],
      reachedLimit: true,
    });

    const [, request] = fetchMock.mock.calls[0] as [URL, RequestInit];
    const grant = String((request.headers as Record<string, string>)?.["x-reports-grant"]);
    expect(new URL(fetchMock.mock.calls[0]?.[0] as URL).toString()).toBe(
      "http://regularize.test/internal/reporting/extract",
    );
    expect(JSON.parse(Buffer.from(grant, "base64url").toString("utf8"))).toMatchObject({
      audience: "regularize-service",
      organization_id: "10000000-0000-4000-8000-000000000001",
      source: "regularize.processes",
    });
    expect((request.headers as Record<string, string>)["x-reports-grant-signature"]).toBe(
      createHmac("sha256", "regularize-reporting-secret").update(grant).digest("hex"),
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
    const adapter = new RegularizeProcessAdapter({
      regularizeServiceUrl: "http://regularize.test",
      regularizeReportingToken: "regularize-reporting-token",
      regularizeReportingGrantSecret: "regularize-reporting-secret",
      sourceTimeoutMs: 100,
    });

    await expect(
      adapter.preview({
        definition: {
          sources: ["regularize.processes"],
          columns: [{ source: "regularize.processes", field: "status", alias: "status" }],
          joins: [],
          filters: [],
          filter_groups: [],
          parameters: [],
          aggregations: [],
          order_by: [],
        },
        organization_id: "10000000-0000-4000-8000-000000000001",
        limit: 10,
        request_id: "request-848",
      }),
    ).rejects.toMatchObject({ statusCode: 503 });
  });
});
