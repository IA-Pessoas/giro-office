const stringOperators = ["eq", "neq", "contains", "in"] as const;
const dateOperators = ["eq", "neq", "gt", "gte", "lt", "lte", "between"] as const;

function field(
  key: string,
  label: string,
  value_type: "string" | "date",
  filter_operators: readonly string[],
) {
  return { key, label, value_type, filter_operators, aggregations: [] as const };
}

export const TI_EXTENSIONS_REPORTING_SOURCES = ["ti.extensions"] as const;
export type TiExtensionsReportingSource = (typeof TI_EXTENSIONS_REPORTING_SOURCES)[number];

export const tiExtensionsReportingCatalog = {
  sources: [
    {
      key: "ti.extensions",
      label: "Ramais de Tecnologia",
      module: "ti",
      minimum_permission: 1,
      keys: [field("user_id", "Usuário", "string", ["eq", "in"])],
      fields: [
        field("number", "Ramal", "string", stringOperators),
        field("created_at", "Data de criação", "date", dateOperators),
        field("updated_at", "Data de atualização", "date", dateOperators),
      ],
    },
  ],
  relations: [],
} as const;

export function getTiExtensionsReportingFields(
  source: TiExtensionsReportingSource,
): readonly string[] {
  return (
    tiExtensionsReportingCatalog.sources
      .find((candidate) => candidate.key === source)
      ?.fields.map((candidate) => candidate.key) ?? []
  );
}
