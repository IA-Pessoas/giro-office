import { createHash, createHmac } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { ProjectAdapter } from "../integrations/projectAdapter.js";

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

describe("ProjectAdapter", () => {
  it("publica somente os campos seguros e assina o extract com request id", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        success: true,
        data: { rows: [{ name: "Projeto seguro" }], reachedLimit: false },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new ProjectAdapter({
      projectServiceUrl: "http://project.test",
      reportsInternalToken: "internal-token",
      reportsGrantSecret: "grant-secret",
      sourceTimeoutMs: 100,
    });

    expect(adapter.sources).toHaveLength(1);
    expect(adapter.sources[0]?.fields.map((field) => field.key)).toEqual([
      "name",
      "status",
      "start_date",
      "end_date",
      "objective",
      "porcentage",
    ]);
    expect(adapter.sources[0]?.fields.map((field) => field.key)).not.toContain("client_id");

    await expect(
      adapter.preview({
        definition: {
          sources: ["integracao.projects"],
          columns: [{ source: "integracao.projects", field: "name", alias: "name" }],
          joins: [],
          filters: [],
          filter_groups: [],
          parameters: [],
          aggregations: [],
          order_by: [],
        },
        organization_id: "00000000-0000-4000-8000-000000000001",
        limit: 10,
        request_id: "request-832",
      }),
    ).resolves.toEqual([{ name: "Projeto seguro" }]);

    const [, request] = fetchMock.mock.calls[0] as [URL, RequestInit];
    const body = { source: "integracao.projects", fields: ["name"], limit: 10 };
    expect(new URL(fetchMock.mock.calls[0]?.[0] as URL).toString()).toBe(
      "http://project.test/internal/reporting/extract",
    );
    expect(request.headers).toEqual(
      expect.objectContaining({
        "x-internal-service-token": "internal-token",
        "x-request-id": "request-832",
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
    const adapter = new ProjectAdapter({
      projectServiceUrl: "http://project.test",
      reportsInternalToken: "internal-token",
      reportsGrantSecret: "grant-secret",
      sourceTimeoutMs: 100,
    });

    await expect(
      adapter.preview({
        definition: {
          sources: ["integracao.projects"],
          columns: [{ source: "integracao.projects", field: "name", alias: "name" }],
          joins: [],
          filters: [],
          filter_groups: [],
          parameters: [],
          aggregations: [],
          order_by: [],
        },
        organization_id: "00000000-0000-4000-8000-000000000001",
        limit: 10,
        request_id: "request-832",
      }),
    ).rejects.toMatchObject({ statusCode: 503 });
  });
});
