import { createHash, createHmac } from "node:crypto";

import { regularizeLicenseReportingCatalog } from "@workspace/shared";
import { describe, expect, it, vi } from "vitest";

import { RegularizeLicenseAdapter } from "../integrations/regularizeLicenseAdapter.js";

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

describe("RegularizeLicenseAdapter", () => {
  it("publica apenas campos seguros e assina o extract interno", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        success: true,
        data: {
          rows: [
            {
              has: true,
              protocol: "P-1",
              id: "nao-publicar",
              client_id: "nao-publicar",
              responsible_id: "nao-publicar",
              task_id: "nao-publicar",
            },
          ],
          reachedLimit: false,
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new RegularizeLicenseAdapter({
      regularizeServiceUrl: "http://regularize.test",
      regularizeReportingToken: "regularize-reporting-token",
      regularizeReportingGrantSecret: "regularize-reporting-secret",
      sourceTimeoutMs: 100,
    });

    expect(adapter.sources[0]?.fields.map((field) => field.key)).toEqual([
      "has",
      "type_license",
      "protocol",
      "status",
      "current_situation",
      "urgency",
      "entry_date",
      "date_last_consultation",
      "due_date",
    ]);
    expect(adapter.sources[0]?.keys).toBeUndefined();
    expect(regularizeLicenseReportingCatalog.sources[0]?.keys.map((field) => field.key)).toEqual([
      "client_id",
      "responsible_id",
      "task_id",
    ]);

    await expect(
      adapter.preview({
        definition: {
          sources: ["regularize.licenses"],
          columns: [
            { source: "regularize.licenses", field: "has", alias: "has" },
            { source: "regularize.licenses", field: "protocol", alias: "protocol" },
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
        request_id: "request-847",
      }),
    ).resolves.toEqual({
      rows: [{ has: true, protocol: "P-1" }],
      reachedLimit: false,
    });

    const [, request] = fetchMock.mock.calls[0] as [URL, RequestInit];
    const body = { source: "regularize.licenses", fields: ["has", "protocol"], limit: 10 };
    expect(new URL(fetchMock.mock.calls[0]?.[0] as URL).toString()).toBe(
      "http://regularize.test/internal/reporting/extract",
    );
    expect(request.headers).toEqual(
      expect.objectContaining({
        "x-internal-service-token": "regularize-reporting-token",
        "x-request-id": "request-847",
      }),
    );
    const grant = String((request.headers as Record<string, string>)["x-reports-grant"]);
    expect((request.headers as Record<string, string>)["x-reports-grant-signature"]).toBe(
      createHmac("sha256", "regularize-reporting-secret").update(grant).digest("hex"),
    );
    expect(JSON.parse(Buffer.from(grant, "base64url").toString("utf8"))).toMatchObject({
      audience: "regularize-service",
      organization_id: "10000000-0000-4000-8000-000000000001",
      source: "regularize.licenses",
    });
    expect(JSON.parse(Buffer.from(grant, "base64url").toString("utf8")).body_sha256).toBe(
      createHash("sha256").update(canonicalJson(body)).digest("hex"),
    );
  });

  it("converte resposta upstream inválida em erro seguro", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, json: vi.fn().mockResolvedValue({}) }),
    );
    const adapter = new RegularizeLicenseAdapter({
      regularizeServiceUrl: "http://regularize.test",
      regularizeReportingToken: "regularize-reporting-token",
      regularizeReportingGrantSecret: "regularize-reporting-secret",
      sourceTimeoutMs: 100,
    });

    await expect(
      adapter.preview({
        definition: {
          sources: ["regularize.licenses"],
          columns: [{ source: "regularize.licenses", field: "has", alias: "has" }],
          joins: [],
          filters: [],
          filter_groups: [],
          parameters: [],
          aggregations: [],
          order_by: [],
        },
        organization_id: "10000000-0000-4000-8000-000000000001",
        limit: 10,
        request_id: "request-847",
      }),
    ).rejects.toMatchObject({ statusCode: 503 });
  });

  it("propaga reachedLimit da origem para a execução", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          success: true,
          data: { rows: [{ has: true }], reachedLimit: true },
        }),
      }),
    );
    const adapter = new RegularizeLicenseAdapter({
      regularizeServiceUrl: "http://regularize.test",
      regularizeReportingToken: "regularize-reporting-token",
      regularizeReportingGrantSecret: "regularize-reporting-secret",
      sourceTimeoutMs: 100,
    });

    await expect(
      adapter.preview({
        definition: {
          sources: ["regularize.licenses"],
          columns: [{ source: "regularize.licenses", field: "has", alias: "has" }],
          joins: [],
          filters: [],
          filter_groups: [],
          parameters: [],
          aggregations: [],
          order_by: [],
        },
        organization_id: "10000000-0000-4000-8000-000000000001",
        limit: 101,
        request_id: "request-847",
      }),
    ).resolves.toEqual({ rows: [{ has: true }], reachedLimit: true });
  });
});
