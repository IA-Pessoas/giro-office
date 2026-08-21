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
    expect(reportDefinitionSchema.parse(definition)).toEqual(definition);
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

  it("rejeita chave técnica, SQL, tabela, expressão e transformador", () => {
    for (const invalidDefinition of [
      {
        ...definition,
        columns: [{ source: "integracao.clients", field: "client_id", alias: "id" }],
      },
      { ...definition, sql: "select *" },
      { ...definition, table: "clientes.clients" },
      { ...definition, expression: "count(*)" },
      { ...definition, transformer: "normalize" },
    ]) {
      expect(() => reportDefinitionSchema.parse(invalidDefinition)).toThrow();
    }
  });

  it("rejeita operador incompatível e parâmetro ausente", () => {
    expect(() =>
      reportDefinitionSchema.parse({
        ...definition,
        filters: [
          {
            source: "parcelamento.installments",
            field: "agreement_number",
            operator: "gt",
            parameter: "status",
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      reportDefinitionSchema.parse({
        ...definition,
        filters: [{ ...definition.filters[0], parameter: "missing" }],
      }),
    ).toThrow();
  });

  it("rejeita join ou relação não aprovados e agregação incompatível", () => {
    for (const type of ["right", "full"]) {
      expect(() =>
        reportDefinitionSchema.parse({
          ...definition,
          joins: [{ ...definition.joins[0], type }],
        }),
      ).toThrow();
    }
    expect(() =>
      reportDefinitionSchema.parse({
        ...definition,
        joins: [{ ...definition.joins[0], relation: "parcelamento.installments.unknown" }],
      }),
    ).toThrow();
    expect(() =>
      reportDefinitionSchema.parse({
        ...definition,
        aggregations: [{ source: "integracao.clients", field: "name", function: "sum" }],
      }),
    ).toThrow();
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
