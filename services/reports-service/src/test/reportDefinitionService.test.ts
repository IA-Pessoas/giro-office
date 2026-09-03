import { ServiceError } from "@workspace/shared";
import { describe, expect, it, vi } from "vitest";
import { SourceCatalogService } from "../catalog/sourceCatalogService.js";
import type { ReportCatalogScope, ReportSourceAdapter } from "../catalog/types.js";
import { reportDefinitionSchema } from "../schemas/reportDefinition.schemas.js";
import { ReportDefinitionService } from "../services/reportDefinitionService.js";

const organizationId = "00000000-0000-4000-8000-000000000002";

const adapter: ReportSourceAdapter = {
  sources: [
    {
      key: "finance.ledger",
      label: "Livro razão",
      module: "financeiro",
      minimum_permission: 1,
      fields: [
        {
          key: "balance",
          label: "Saldo",
          value_type: "number",
          filter_operators: ["eq", "gt"],
          aggregations: ["sum"],
        },
      ],
    },
  ],
  relations: [],
  isEnabled: vi.fn(() => true),
  preview: vi.fn(),
};

const scope: ReportCatalogScope = {
  organization_id: organizationId,
  modules: { financeiro: 1 },
};

const definition = {
  sources: ["finance.ledger"],
  columns: [{ source: "finance.ledger", field: "balance", alias: "balance" }],
  aggregations: [{ source: "finance.ledger", field: "balance", function: "sum" }],
};

describe("SourceCatalogService", () => {
  it("omite fonte sem permissão e campo removido pelo grant", () => {
    const service = new SourceCatalogService([adapter]);

    expect(service.getAuthorizedCatalog({ ...scope, modules: { financeiro: 0 } }).sources).toEqual(
      [],
    );
    expect(
      service.getAuthorizedCatalog({
        ...scope,
        grant: { sources: { "finance.ledger": [] }, relations: [] },
      }).sources,
    ).toEqual([]);
  });

  it("mantém fonte sem campo quando ela é necessária para relação concedida", () => {
    const service = new SourceCatalogService([
      {
        ...adapter,
        sources: [
          ...adapter.sources,
          {
            key: "finance.accounts",
            label: "Contas",
            module: "financeiro",
            minimum_permission: 1,
            fields: [
              {
                key: "id",
                label: "Id",
                value_type: "string",
                filter_operators: ["eq"],
                aggregations: [],
              },
            ],
          },
        ],
        relations: [
          {
            key: "ledger-account",
            sources: ["finance.ledger", "finance.accounts"],
            cardinality: "many_to_one",
          },
        ],
      },
    ]);

    expect(
      service.getAuthorizedCatalog({
        ...scope,
        grant: {
          sources: { "finance.ledger": ["balance"], "finance.accounts": [] },
          relations: ["ledger-account"],
        },
      }),
    ).toMatchObject({
      sources: [
        { key: "finance.ledger", fields: [{ key: "balance" }] },
        { key: "finance.accounts", fields: [] },
      ],
      relations: [{ key: "ledger-account" }],
    });
  });
});

describe("ReportDefinitionService", () => {
  it("rejeita agregação incompatível e campo fora do grant", () => {
    const catalog = new SourceCatalogService([adapter]);
    const service = new ReportDefinitionService(catalog);

    expect(() =>
      service.validate(
        reportDefinitionSchema.parse({
          ...definition,
          aggregations: [{ source: "finance.ledger", field: "balance", function: "avg" }],
        }),
        scope,
      ),
    ).toThrow(ServiceError);
    expect(() =>
      service.validate(reportDefinitionSchema.parse(definition), {
        ...scope,
        grant: { sources: { "finance.ledger": [] }, relations: [] },
      }),
    ).toThrow(ServiceError);
  });
});
