import { describe, expect, it, vi } from "vitest";

import { ParcelamentoAdapter } from "../integrations/parcelamentoAdapter.js";

describe("ParcelamentoAdapter", () => {
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
