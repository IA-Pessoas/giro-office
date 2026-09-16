import { clientIntegrationReportingCatalog } from "@workspace/shared";
import { describe, expect, it, vi } from "vitest";

import { ClientIntegrationAdapter } from "../integrations/clientIntegrationAdapter.js";

describe("ClientIntegrationAdapter", () => {
  it("publica só campos seguros e chama extract interno com request id", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        success: true,
        data: { rows: [{ name: "Cliente seguro" }], reachedLimit: true },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new ClientIntegrationAdapter({
      clientServiceUrl: "http://client.test",
      reportsInternalToken: "internal-token",
      reportsGrantSecret: "grant-secret",
      sourceTimeoutMs: 100,
    });

    expect(adapter.sources[0]?.fields.map((field) => field.key)).not.toContain("cpf_cnpj");
    expect(clientIntegrationReportingCatalog.sources[0]?.keys.map((field) => field.key)).toEqual([
      "client_id",
    ]);
    expect(adapter.relations).toEqual([]);

    await expect(
      adapter.preview({
        definition: {
          sources: ["integracao.clients"],
          columns: [{ source: "integracao.clients", field: "name", alias: "name" }],
          joins: [],
          filters: [],
          filter_groups: [],
          parameters: [],
          aggregations: [],
          order_by: [],
        },
        organization_id: "00000000-0000-4000-8000-000000000002",
        limit: 10,
        request_id: "request-812",
      }),
    ).resolves.toEqual({ rows: [{ name: "Cliente seguro" }], reachedLimit: true });

    expect(new URL(fetchMock.mock.calls[0]?.[0] as URL).toString()).toBe(
      "http://client.test/internal/reporting/extract",
    );
  });
});
