import { RH_MANAGEMENT_PERMISSION } from "../rh/permissions.js";
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

export const RH_VACATION_REPORTING_SOURCES = ["rh.vacationHistory"] as const;
export type RhVacationReportingSource = (typeof RH_VACATION_REPORTING_SOURCES)[number];

export const rhVacationReportingCatalog = {
  sources: [
    {
      key: "rh.vacationHistory",
      label: "Histórico de férias por colaborador",
      module: "rh",
      minimum_permission: RH_MANAGEMENT_PERMISSION,
      keys: [],
      fields: [
        field("employee_name", "Colaborador", "string", stringOperators),
        field("period_start", "Período inicial", "date", dateOperators),
        field("period_end", "Período final", "date", dateOperators),
        field("acquisition_start", "Início do período aquisitivo", "date", dateOperators),
        field("acquisition_end", "Fim do período aquisitivo", "date", dateOperators),
        field("uses", "Usos de férias", "string", stringOperators),
      ],
    },
  ],
  relations: [],
} as const;

export function getRhVacationReportingFields(source: RhVacationReportingSource): readonly string[] {
  return (
    rhVacationReportingCatalog.sources
      .find((candidate) => candidate.key === source)
      ?.fields.map((candidate) => candidate.key) ?? []
  );
}
