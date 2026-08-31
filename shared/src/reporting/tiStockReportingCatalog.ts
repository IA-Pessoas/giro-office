const stringOperators = ["eq", "neq", "contains", "in"] as const;
const numberOperators = ["eq", "gt", "gte", "lt", "lte", "between"] as const;
const booleanOperators = ["eq", "neq"] as const;

function field(
  key: string,
  label: string,
  value_type: "string" | "number" | "boolean",
  filter_operators: readonly string[],
) {
  return { key, label, value_type, filter_operators, aggregations: [] as const };
}

export const TI_STOCK_REPORTING_SOURCES = ["ti.stock"] as const;
export type TiStockReportingSource = (typeof TI_STOCK_REPORTING_SOURCES)[number];

export const tiStockReportingCatalog = {
  sources: [
    {
      key: "ti.stock",
      label: "Estoque de TI",
      module: "ti",
      minimum_permission: 1,
      keys: [
        field("department_id", "Departamento", "string", ["eq", "in"]),
        field("category_id", "Categoria", "string", ["eq", "in"]),
        field("location_id", "Localização", "string", ["eq", "in"]),
      ],
      fields: [
        field("name", "Nome", "string", stringOperators),
        field("category", "Categoria", "string", stringOperators),
        field("location", "Localização", "string", stringOperators),
        field("quantity", "Quantidade", "number", numberOperators),
        field("description", "Descrição", "string", stringOperators),
        field("status", "Status", "boolean", booleanOperators),
      ],
    },
  ],
  relations: [],
} as const;

export function getTiStockReportingFields(source: TiStockReportingSource): readonly string[] {
  return (
    tiStockReportingCatalog.sources
      .find((candidate) => candidate.key === source)
      ?.fields.map((candidate) => candidate.key) ?? []
  );
}
