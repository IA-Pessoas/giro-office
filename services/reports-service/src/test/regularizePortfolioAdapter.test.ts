import { regularizePortfolioReportingCatalog } from "@workspace/shared";
import { describe, expect, it, vi } from "vitest";

import { SourceCatalogService } from "../catalog/sourceCatalogService.js";
import { ClientIntegrationAdapter } from "../integrations/clientIntegrationAdapter.js";
import { RegularizePortfolioAdapter } from "../integrations/regularizePortfolioAdapter.js";

describe("RegularizePortfolioAdapter", () => {
  it("publica somente os campos seguros e remove chaves da resposta interna", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        success: true,
        data: {
          rows: [
            {
              group_name: "Grupo Norte",
              status: "Processo de Inativação",
              client_id: "nao-publicar",
              id: "nao-publicar",
            },
          ],
          reachedLimit: true,
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new RegularizePortfolioAdapter({
      regularizeServiceUrl: "http://regularize.test",
      regularizeReportingToken: "regularize-reporting-token",
      regularizeReportingGrantSecret: "regularize-reporting-secret",
      sourceTimeoutMs: 100,
    });

    expect(adapter.sources.map((source) => source.key)).toEqual([
      "regularize.clients",
      "regularize.client_groups",
    ]);
    expect(adapter.sources.every((source) => source.module === "regularize")).toBe(true);
    // Integração sozinha não libera a carteira; Regularize sozinho libera.
    expect(adapter.isEnabled({ modules: { integracao: 3 } })).toBe(false);
    expect(adapter.isEnabled({ modules: { regularize: 1 } })).toBe(true);
    expect(adapter.sources[0]?.keys).toBeUndefined();
    expect(regularizePortfolioReportingCatalog.sources[0]?.keys.map((field) => field.key)).toEqual([
      "client_id",
    ]);
    expect(
      regularizePortfolioReportingCatalog.sources[0]?.fields.map((field) => field.key),
    ).not.toContain("client_id");
    expect(adapter.sources[1]?.fields.map((field) => field.key)).toEqual(
      expect.arrayContaining(["group_name", "status", "licitacao", "has_passwords"]),
    );

    await expect(
      adapter.preview({
        definition: {
          sources: ["regularize.client_groups"],
          columns: [
            { source: "regularize.client_groups", field: "group_name", alias: "group_name" },
            { source: "regularize.client_groups", field: "status", alias: "status" },
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
      rows: [{ group_name: "Grupo Norte", status: "Processo de Inativação" }],
      reachedLimit: true,
    });

    expect(new URL(fetchMock.mock.calls[0]?.[0] as URL).toString()).toBe(
      "http://regularize.test/internal/reporting/extract",
    );
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1].body as string)).toEqual({
      source: "regularize.client_groups",
      fields: ["group_name", "status"],
      limit: 102,
    });
  });

  it("separa a carteira do Regularize das fontes de Integração no catálogo autorizado", () => {
    const env = {
      regularizeServiceUrl: "http://regularize.test",
      regularizeReportingToken: "token",
      regularizeReportingGrantSecret: "secret",
      clientServiceUrl: "http://client.test",
      reportsInternalToken: "token",
      reportsGrantSecret: "secret",
      sourceTimeoutMs: 100,
    };
    const catalog = new SourceCatalogService([
      new ClientIntegrationAdapter(env),
      new RegularizePortfolioAdapter(env),
    ]);
    const keys = (modules: Record<string, number>) =>
      catalog.getAuthorizedCatalog({ modules } as never).sources.map((source) => source.key);

    expect(keys({ regularize: 1 })).toEqual(["regularize.clients", "regularize.client_groups"]);
    expect(keys({ integracao: 3 })).toEqual(["integracao.clients", "integracao.client_groups"]);
  });

  it("converte resposta upstream inválida em erro seguro", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, json: vi.fn().mockResolvedValue({}) }),
    );
    const adapter = new RegularizePortfolioAdapter({
      regularizeServiceUrl: "http://regularize.test",
      regularizeReportingToken: "regularize-reporting-token",
      regularizeReportingGrantSecret: "regularize-reporting-secret",
      sourceTimeoutMs: 100,
    });

    await expect(
      adapter.preview({
        definition: {
          sources: ["regularize.client_groups"],
          columns: [
            { source: "regularize.client_groups", field: "group_name", alias: "group_name" },
          ],
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
