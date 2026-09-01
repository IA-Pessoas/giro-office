const stringOperators = ["eq", "neq", "contains", "in"] as const;
const dateOperators = ["eq", "neq", "gt", "gte", "lt", "lte", "between"] as const;

function field(
  key: string,
  label: string,
  value_type: "string" | "date",
  filter_operators: readonly string[],
) {
  return { key, label, value_type, filter_operators, aggregations: [] };
}

export const RH_HOLIDAY_REPORTING_SOURCES = ["rh.holidays"] as const;
export type RhHolidayReportingSource = (typeof RH_HOLIDAY_REPORTING_SOURCES)[number];

export const rhHolidayReportingCatalog = {
  sources: [
    {
      key: "rh.holidays",
      label: "Feriados",
      module: "rh",
      minimum_permission: 1,
      keys: [],
      fields: [
        field("name", "Nome", "string", stringOperators),
        field("date", "Data", "date", dateOperators),
      ],
    },
  ],
  relations: [],
} as const;

export function getRhHolidayReportingFields(source: RhHolidayReportingSource): readonly string[] {
  return (
    rhHolidayReportingCatalog.sources
      .find((candidate) => candidate.key === source)
      ?.fields.map((candidate) => candidate.key) ?? []
  );
}
