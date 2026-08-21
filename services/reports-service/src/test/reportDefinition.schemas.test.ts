import { describe, expect, it } from "vitest";

import {
  MAX_DECLARED_REPORT_BYTES,
  MAX_DECLARED_REPORT_ROWS,
  reportDefinitionSchema,
} from "../schemas/reportDefinition.schemas.js";
import { reportPreviewQuerySchema } from "../schemas/reportPreview.schemas.js";

const definition = {
  sources: ["parcelamento.installments", "integracao.clients"],
  columns: [
    { source: "parcelamento.installments", field: "agreement_number", alias: "agreement" },
    { source: "integracao.clients", field: "name", alias: "client_name" },
  ],
  joins: [
    {
      relation: "parcelamento.installments.client",
      type: "left",
    },
  ],
  filters: [
    {
      source: "parcelamento.installments",
      field: "status",
      operator: "eq",
      parameter: "status",
    },
  ],
  filter_groups: [{ operator: "and", filters: ["status"] }],
  parameters: [{ name: "status", type: "string" }],
  aggregations: [{ source: "parcelamento.installments", field: "total_amount", function: "sum" }],
};

describe("reportDefinitionSchema", () => {
  it("aceita apenas uma definição declarativa publicada", () => {
    expect(reportDefinitionSchema.parse(definition)).toMatchObject(definition);
  });

  it("aceita identificadores declarativos de adapters publicados em tempo de execução", () => {
    const adapterDefinition = {
      sources: ["finance.ledger"],
      columns: [{ source: "finance.ledger", field: "balance", alias: "balance" }],
    };

    expect(reportDefinitionSchema.parse(adapterDefinition)).toMatchObject(adapterDefinition);
  });

  it("rejeita aliases duplicados", () => {
    expect(() =>
      reportDefinitionSchema.parse({
        ...definition,
        columns: [...definition.columns, { ...definition.columns[0], field: "status" }],
      }),
    ).toThrow();
  });

  it("rejeita parâmetros duplicados", () => {
    expect(() =>
      reportDefinitionSchema.parse({
        ...definition,
        parameters: [...definition.parameters, { name: "status", type: "string" }],
      }),
    ).toThrow();
  });

  it("rejeita SQL, tabela, expressão e transformador", () => {
    for (const invalidDefinition of [
      { ...definition, sql: "select *" },
      { ...definition, table: "clientes.clients" },
      { ...definition, expression: "count(*)" },
      { ...definition, transformer: "normalize" },
    ]) {
      expect(() => reportDefinitionSchema.parse(invalidDefinition)).toThrow();
    }
  });

  it("rejeita filtro com fonte fora da definição", () => {
    expect(() =>
      reportDefinitionSchema.parse({
        ...definition,
        filters: [
          {
            source: "finance.ledger",
            field: "balance",
            operator: "eq",
            parameter: "status",
          },
        ],
      }),
    ).toThrow();
  });

  it("rejeita joins Right e Full", () => {
    for (const type of ["right", "full"]) {
      expect(() =>
        reportDefinitionSchema.parse({
          ...definition,
          joins: [{ ...definition.joins[0], type }],
        }),
      ).toThrow();
    }
  });

  it("rejeita página e custo declarados acima dos limites", () => {
    expect(() => reportPreviewQuerySchema.parse({ page: 2, page_size: 101 })).toThrow();
    expect(() =>
      reportDefinitionSchema.parse({
        ...definition,
        declared_cost: { rows: MAX_DECLARED_REPORT_ROWS + 1, bytes: MAX_DECLARED_REPORT_BYTES },
      }),
    ).toThrow();
  });
});
