import { describe, expect, it, vi } from "vitest";

import { ParcelamentoAdapter } from "../integrations/parcelamentoAdapter.js";

describe("ParcelamentoAdapter", () => {
  it("publica a matriz aprovada sem expor chaves de relacionamento como campos", () => {
    const adapter = new ParcelamentoAdapter({
      parcelamentoServiceUrl: "http://parcelamento.test",
      reportsInternalToken: "internal-token",
      reportsGrantSecret: "grant-secret",
      sourceTimeoutMs: 100,
    });
    const installments = adapter.sources.find(
      (source) => source.key === "parcelamento.installments",
    );
    const competencies = adapter.sources.find(
      (source) => source.key === "parcelamento.installment_competencies",
    );
    const panoramas = adapter.sources.find((source) => source.key === "parcelamento.panoramas");

    expect(installments?.fields.map((field) => field.key)).toEqual(
      expect.arrayContaining([
        "first_installment_amount",
        "current_month_installment_amount",
        "agreed_installments_count",
        "remaining_installments_count",
        "completion_date",
        "agreement_number",
      ]),
    );
    expect(competencies?.fields.map((field) => field.key)).toContain("upload_file");
    expect(panoramas?.fields.map((field) => field.key)).toEqual(
      expect.arrayContaining(["state_tax_situation", "federal_tax_situation"]),
    );
    expect(
      adapter.sources.flatMap((source) => source.fields).map((field) => field.key),
    ).not.toEqual(
      expect.arrayContaining(["client_id", "installment_id", "responsavel_id", "document_url"]),
    );
    expect(adapter.relations).toEqual([]);
  });

  it("propaga request id e usa exclusivamente o extract interno", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ success: true, data: { rows: [{ status: "active" }] } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new ParcelamentoAdapter({
      parcelamentoServiceUrl: "http://parcelamento.test",
      reportsInternalToken: "internal-token",
      reportsGrantSecret: "grant-secret",
      sourceTimeoutMs: 100,
    });

    await expect(
      adapter.preview({
        definition: {
          sources: ["parcelamento.installments"],
          columns: [{ source: "parcelamento.installments", field: "status", alias: "status" }],
          joins: [],
          filters: [],
          filter_groups: [],
          parameters: [],
          aggregations: [],
          order_by: [],
        },
        organization_id: "00000000-0000-4000-8000-000000000002",
        limit: 10,
        request_id: "request-811",
      }),
    ).resolves.toEqual([{ status: "active" }]);
    expect(new URL(fetchMock.mock.calls[0]?.[0] as URL).toString()).toBe(
      "http://parcelamento.test/internal/reporting/extract",
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({ method: "POST" }),
    );
  });
});
