import { regularizeMunicipalTaxesReportingCatalog } from "@workspace/shared";
import { describe, expect, it, vi } from "vitest";

import { RegularizeMunicipalTaxesAdapter } from "../integrations/regularizeMunicipalTaxesAdapter.js";

describe("RegularizeMunicipalTaxesAdapter", () => {
  it("publica somente os campos seguros e remove chaves da resposta interna", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        success: true,
        data: {
          rows: [{ year: 2026, tff_amount: 123.45, client_id: "nao-publicar", id: "nao-publicar" }],
          reachedLimit: true,
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new RegularizeMunicipalTaxesAdapter({
      regularizeServiceUrl: "http://regularize.test",
      regularizeReportingToken: "regularize-reporting-token",
      regularizeReportingGrantSecret: "regularize-reporting-secret",
      sourceTimeoutMs: 100,
    });

    expect(adapter.sources[0]?.keys).toBeUndefined();
    expect(
      regularizeMunicipalTaxesReportingCatalog.sources[0]?.keys.map((field) => field.key),
    ).toEqual(["client_id"]);
    expect(
      regularizeMunicipalTaxesReportingCatalog.sources[0]?.fields.map((field) => field.key),
    ).not.toContain("client_id");
    expect(adapter.sources[0]?.fields.map((field) => field.key)).toEqual(
      expect.arrayContaining(["year", "tff_amount", "tlp_due_date", "tll_analysis_is_done"]),
    );

    await expect(
      adapter.preview({
        definition: {
          sources: ["regularize.municipal_taxes"],
          columns: [
            { source: "regularize.municipal_taxes", field: "year", alias: "year" },
            { source: "regularize.municipal_taxes", field: "tff_amount", alias: "tff_amount" },
          ],
          joins: [],
          filters: [],
          filter_groups: [],
          parameters: [],
          aggregations: [],
          order_by: [],
        },
        organization_id: "10000000-0000-4000-8000-000000000001",
        limit: 102,
        request_id: "request-849",
      }),
    ).resolves.toEqual({
      rows: [{ year: 2026, tff_amount: 123.45 }],
      reachedLimit: true,
    });

    expect(new URL(fetchMock.mock.calls[0]?.[0] as URL).toString()).toBe(
      "http://regularize.test/internal/reporting/extract",
    );
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1].body as string)).toEqual({
      source: "regularize.municipal_taxes",
      fields: ["year", "tff_amount"],
      limit: 102,
    });
  });

  it("converte resposta upstream inválida em erro seguro", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, json: vi.fn().mockResolvedValue({}) }),
    );
    const adapter = new RegularizeMunicipalTaxesAdapter({
      regularizeServiceUrl: "http://regularize.test",
      regularizeReportingToken: "regularize-reporting-token",
      regularizeReportingGrantSecret: "regularize-reporting-secret",
      sourceTimeoutMs: 100,
    });

    await expect(
      adapter.preview({
        definition: {
          sources: ["regularize.municipal_taxes"],
          columns: [{ source: "regularize.municipal_taxes", field: "year", alias: "year" }],
          joins: [],
          filters: [],
          filter_groups: [],
          parameters: [],
          aggregations: [],
          order_by: [],
        },
        organization_id: "10000000-0000-4000-8000-000000000001",
        limit: 1,
        request_id: "request-849",
      }),
    ).rejects.toMatchObject({ statusCode: 503 });
  });
});
