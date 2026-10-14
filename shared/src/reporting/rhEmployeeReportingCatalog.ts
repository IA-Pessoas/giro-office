import { RH_MANAGEMENT_PERMISSION } from "../rh/permissions.js";
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

const employeeNameField = field("name", "Colaborador", "string", stringOperators);
const departmentField = field("department", "Departamento", "string", stringOperators);

const employeeFields = [
  employeeNameField,
  field("status", "Status", "string", stringOperators),
  departmentField,
  field("birth_month", "Mês de aniversário", "number", numberOperators),
] as const;

export const rhEmployeeReportingCatalog = {
  sources: [
    {
      key: "rh.employees",
      label: "Colaboradores por departamento",
      module: "rh",
      minimum_permission: RH_MANAGEMENT_PERMISSION,
      keys: [],
      fields: employeeFields,
    },
    {
      key: "rh.birthdays",
      label: "Aniversariantes por mês",
      module: "rh",
      minimum_permission: RH_MANAGEMENT_PERMISSION,
      keys: [],
      fields: [
        employeeNameField,
        departmentField,
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
