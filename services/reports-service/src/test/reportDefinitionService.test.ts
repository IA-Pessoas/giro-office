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

describe("ReportDefinitionService composed criteria", () => {
  const service = new ReportDefinitionService(
    new SourceCatalogService([
      {
        ...adapter,
        sources: [
          {
            ...adapter.sources[0],
            fields: adapter.sources[0].fields.map((field) => ({
              ...field,
              groupable: true,
              sortable: true,
            })),
            parameters: [
              {
                key: "criterion_1",
                label: "Opção",
                type: "select",
                required: true,
                options: [{ value: "active", label: "Ativo" }],
              },
            ],
          },
        ],
      },
    ]),
  );
  const area = {
    source: "finance.ledger",
    fields: ["balance"],
    parameterValues: { criterion_1: "active" },
  };
  it("keeps published parameter values separate from generated filter parameters", () => {
    const result = service.prepareArea(
      { ...area, filters: [{ field: "balance", operator: "eq", value: 10 }] },
      scope,
    );
    expect(result.parameterValues).toEqual({ criterion_1: "active", criterion_2: 10 });
    expect(result.definition.filters[0].parameter).toBe("criterion_2");
  });
  it("rejects unpublished parameters, unsupported options, duplicate grouping and incompatible ordering", () => {
    expect(() =>
      service.validateComposition(
        { version: 2, areas: [{ ...area, parameterValues: { other: "secret" } }] },
        scope,
      ),
    ).toThrow("parâmetros disponíveis");
    expect(() =>
      service.validateComposition(
        { version: 2, areas: [{ ...area, parameterValues: { criterion_1: "unknown" } }] },
        scope,
      ),
    ).toThrow("opções do parâmetro");
    expect(() =>
      service.validateComposition(
        { version: 2, areas: [{ ...area, groupBy: ["balance", "balance"] }] },
        scope,
      ),
    ).toThrow("apenas uma vez");
    expect(() =>
      service.validateComposition(
        {
          version: 2,
          areas: [
            {
              ...area,
              aggregations: [{ field: "balance", function: "sum" }],
              orderBy: [{ field: "balance", direction: "asc" }],
            },
          ],
        },
        scope,
      ),
    ).toThrow("campos agrupados");
  });
});

describe("SourceCatalogService", () => {
  it("publica apresentação amigável apenas para áreas autorizadas", () => {
    const service = new SourceCatalogService([adapter]);
    expect(service.getAuthorizedCatalog(scope).sources).toMatchObject([
      { label: "Livro razão", department_label: "Financeiro", description: expect.any(String) },
    ]);
    expect(service.getAuthorizedCatalog({ ...scope, modules: {} }).sources).toEqual([]);
  });
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
