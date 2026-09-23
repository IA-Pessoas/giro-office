import { createHash, createHmac } from "node:crypto";

import { MAX_REPORTING_QUERY_LIMIT, rhRequestReportingCatalog } from "@workspace/shared";
import { describe, expect, it, vi } from "vitest";

import { RhRequestAdapter } from "../integrations/rhRequestAdapter.js";

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

describe("RhRequestAdapter", () => {
  it("publica apenas campos seguros e assina o extract interno", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        success: true,
        data: {
          rows: [
            {
              title: "Férias",
              category: "Benefícios",
              id: "nao-publicar",
              requester_user_id: "nao-publicar",
              assigned_to_user_id: "nao-publicar",
            },
          ],
          reachedLimit: false,
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new RhRequestAdapter({
      rhServiceUrl: "http://rh.test",
      reportsInternalToken: "internal-token",
      reportsGrantSecret: "grant-secret",
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
    expect(adapter.sources[0]?.keys).toBeUndefined();
    expect(rhRequestReportingCatalog.sources[0]?.keys.map((field) => field.key)).toEqual([
      "requester_user_id",
      "assigned_to_user_id",
    ]);

    await expect(
      adapter.preview({
        definition: {
          sources: ["rh.requests"],
          columns: [
            { source: "rh.requests", field: "title", alias: "title" },
            { source: "rh.requests", field: "category", alias: "category" },
          ],
          joins: [],
          filters: [],
          filter_groups: [],
          parameters: [],
          aggregations: [],
          order_by: [],
        },
        organization_id: "10000000-0000-0000-0000-000000000001",
        limit: 10,
        request_id: "request-850",
      }),
    ).resolves.toEqual({
      rows: [{ title: "Férias", category: "Benefícios" }],
      reachedLimit: false,
    });

    const [, request] = fetchMock.mock.calls[0] as [URL, RequestInit];
    const body = { source: "rh.requests", fields: ["title", "category"], limit: 10 };
    expect(new URL(fetchMock.mock.calls[0]?.[0] as URL).toString()).toBe(
      "http://rh.test/internal/reporting/extract",
    );
    expect(request.headers).toEqual(
      expect.objectContaining({
        "x-internal-service-token": "internal-token",
        "x-request-id": "request-850",
      }),
    );
    const grant = String((request.headers as Record<string, string>)["x-reports-grant"]);
    expect((request.headers as Record<string, string>)["x-reports-grant-signature"]).toBe(
      createHmac("sha256", "grant-secret").update(grant).digest("hex"),
    );
    expect(JSON.parse(Buffer.from(grant, "base64url").toString("utf8"))).toMatchObject({
      audience: "rh-service",
      organization_id: "10000000-0000-0000-0000-000000000001",
      source: "rh.requests",
    });
    expect(JSON.parse(Buffer.from(grant, "base64url").toString("utf8")).body_sha256).toBe(
      createHash("sha256").update(canonicalJson(body)).digest("hex"),
    );
  });

  it("limita a solicitação e converte resposta upstream inválida em erro seguro", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        success: true,
        data: { rows: [{ title: "Férias" }], reachedLimit: true },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new RhRequestAdapter({
      rhServiceUrl: "http://rh.test",
      reportsInternalToken: "internal-token",
      reportsGrantSecret: "grant-secret",
      sourceTimeoutMs: 100,
    });

    await expect(
      adapter.preview({
        definition: {
          sources: ["rh.requests"],
          columns: [{ source: "rh.requests", field: "title", alias: "title" }],
          joins: [],
          filters: [],
          filter_groups: [],
          parameters: [],
          aggregations: [],
          order_by: [],
        },
        organization_id: "10000000-0000-0000-0000-000000000001",
        limit: 50001,
        request_id: "request-850",
      }),
    ).resolves.toEqual({ rows: [{ title: "Férias" }], reachedLimit: true });

    const [, request] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(JSON.parse(String(request.body)).limit).toBe(MAX_REPORTING_QUERY_LIMIT);

    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({ ok: false, json: vi.fn().mockResolvedValue({ secret: "hidden" }) }),
    );
    await expect(
      adapter.preview({
        definition: {
          sources: ["rh.requests"],
          columns: [{ source: "rh.requests", field: "title", alias: "title" }],
          joins: [],
          filters: [],
          filter_groups: [],
          parameters: [],
          aggregations: [],
          order_by: [],
        },
        organization_id: "10000000-0000-0000-0000-000000000001",
        limit: 10,
        request_id: "request-850",
      }),
    ).rejects.toMatchObject({ statusCode: 503 });
  });
});
