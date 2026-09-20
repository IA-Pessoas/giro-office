import { reportingAggregations } from "./reportingCapabilities.js";

function field(key: string, label: string, value_type: "string" | "number" | "boolean") {
  return {
    groupable: true,
    sortable: true,
    key,
    label,
    value_type,
    filter_operators: [] as const,
    aggregations: reportingAggregations(value_type),
  };
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
        field("department_id", "Departamento", "string"),
        field("category_id", "Categoria", "string"),
        field("location_id", "Localização", "string"),
      ],
      fields: [
        field("name", "Nome", "string"),
        field("category", "Categoria", "string"),
        field("location", "Localização", "string"),
        field("quantity", "Quantidade", "number"),
        field("description", "Descrição", "string"),
        field("status", "Status", "boolean"),
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
