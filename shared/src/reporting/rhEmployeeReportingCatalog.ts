import { reportingAggregations } from "./reportingCapabilities.js";

const stringOperators = ["eq", "neq", "contains", "in"] as const;
const numberOperators = ["eq", "neq", "gt", "gte", "lt", "lte", "between"] as const;

function field(
  key: string,
  label: string,
  value_type: "string" | "number",
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

export const RH_EMPLOYEE_REPORTING_SOURCES = ["rh.employees", "rh.birthdays"] as const;
export type RhEmployeeReportingSource = (typeof RH_EMPLOYEE_REPORTING_SOURCES)[number];

const employeeFields = [
  field("name", "Colaborador", "string", stringOperators),
  field("status", "Status", "string", stringOperators),
  field("department", "Departamento", "string", stringOperators),
  field("birth_month", "Mês de aniversário", "number", numberOperators),
] as const;

export const rhEmployeeReportingCatalog = {
  sources: [
    {
      key: "rh.employees",
      label: "Colaboradores por departamento",
      module: "rh",
      minimum_permission: 3,
      keys: [],
      fields: employeeFields,
    },
    {
      key: "rh.birthdays",
      label: "Aniversariantes por mês",
      module: "rh",
      minimum_permission: 3,
      keys: [],
      fields: [
        field("name", "Colaborador", "string", stringOperators),
        field("department", "Departamento", "string", stringOperators),
        field("birth_day", "Dia do aniversário", "number", numberOperators),
        field("birth_month", "Mês de aniversário", "number", numberOperators),
      ],
    },
  ],
  relations: [],
} as const;

export function getRhEmployeeReportingFields(source: RhEmployeeReportingSource): readonly string[] {
  return (
    rhEmployeeReportingCatalog.sources
      .find((candidate) => candidate.key === source)
      ?.fields.map((candidate) => candidate.key) ?? []
  );
}
