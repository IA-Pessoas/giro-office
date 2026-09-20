import { reportingAggregations } from "./reportingCapabilities.js";

const stringOperators = ["eq", "neq", "contains", "in"] as const;
const dateOperators = ["eq", "neq", "gt", "gte", "lt", "lte", "between"] as const;

function field(
  key: string,
  label: string,
  value_type: "string" | "date",
  filter_operators: readonly string[],
) {
  return {
    groupable: true,
    sortable: true,
    key,
    label,
    value_type,
    filter_operators,
    aggregations: reportingAggregations(value_type),
  };
}

export const TI_INVENTORY_REPORTING_SOURCES = ["ti.inventory"] as const;
export type TiInventoryReportingSource = (typeof TI_INVENTORY_REPORTING_SOURCES)[number];

export const tiInventoryReportingCatalog = {
  sources: [
    {
      key: "ti.inventory",
      label: "Inventário de Tecnologia",
      module: "ti",
      minimum_permission: 1,
      keys: [
        field("user_id", "Usuário", "string", ["eq", "in"]),
        field("location_id", "Localização", "string", ["eq", "in"]),
        field("category_id", "Categoria", "string", ["eq", "in"]),
        field("responsible_it_staff_id", "Responsável de TI", "string", ["eq", "in"]),
      ],
      fields: [
        field("asset_code", "Código patrimonial", "string", stringOperators),
        field("category", "Categoria", "string", stringOperators),
        field("location", "Localização", "string", stringOperators),
        field("delivery_date", "Data de entrega", "date", dateOperators),
        field("return_date", "Data de devolução", "date", dateOperators),
        field("notes", "Observação", "string", stringOperators),
      ],
    },
  ],
  relations: [],
} as const;

export function getTiInventoryReportingFields(
  source: TiInventoryReportingSource,
): readonly string[] {
  return (
    tiInventoryReportingCatalog.sources
      .find((candidate) => candidate.key === source)
      ?.fields.map((candidate) => candidate.key) ?? []
  );
}
