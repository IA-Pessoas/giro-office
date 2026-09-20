import { describe, expect, it, vi } from "vitest";

import { ContabilRelationshipAdapter } from "../integrations/contabilRelationshipAdapter.js";

describe("ContabilRelationshipAdapter", () => {
  it("publica somente os campos seguros de relacionamento", () => {
    const adapter = new ContabilRelationshipAdapter({
      contabilServiceUrl: "http://contabil.test",
      reportsInternalToken: "internal-token",
      reportsGrantSecret: "grant-secret",
      sourceTimeoutMs: 100,
    });

    expect(adapter.sources.map((source) => source.key)).toEqual(["contabil.relationship"]);
    expect(adapter.sources[0]?.fields.map((field) => field.key)).toEqual([
      "bidding",
      "chart_accounts",
      "tool",
      "system",
    ]);
  });

  it("extrai relacionamento assinando a organização e somente a projeção publicada", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        success: true,
        data: {
          rows: [
            { bidding: true, chart_accounts: "Plano A", tool: "Ferramenta A", system: "Sistema A" },
          ],
          reachedLimit: false,
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new ContabilRelationshipAdapter({
      contabilServiceUrl: "http://contabil.test",
      reportsInternalToken: "internal-token",
      reportsGrantSecret: "grant-secret",
      sourceTimeoutMs: 100,
    });

    await expect(
      adapter.preview({
        definition: {
          sources: ["contabil.relationship"],
          columns: [
            { source: "contabil.relationship", field: "bidding", alias: "bidding" },
            {
              source: "contabil.relationship",
              field: "chart_accounts",
              alias: "chart_accounts",
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
        request_id: "request-836",
      }),
    ).resolves.toEqual({
      rows: [
        { bidding: true, chart_accounts: "Plano A", tool: "Ferramenta A", system: "Sistema A" },
      ],
      reachedLimit: false,
    });

    const [, request] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(JSON.parse(String(request.body))).toEqual({
      source: "contabil.relationship",
      fields: ["bidding", "chart_accounts"],
      limit: 10,
    });
    expect(request.headers).toEqual(
      expect.objectContaining({
        "x-internal-service-token": "internal-token",
        "x-request-id": "request-836",
      }),
    );
  });
});
