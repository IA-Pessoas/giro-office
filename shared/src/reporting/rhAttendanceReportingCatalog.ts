import { reportingAggregations } from "./reportingCapabilities.js";

const stringOperators = ["eq", "neq", "contains", "in"] as const;
const dateOperators = ["eq", "neq", "gt", "gte", "lt", "lte", "between"] as const;
const numberOperators = ["eq", "neq", "gt", "gte", "lt", "lte", "between"] as const;

function field(
  key: string,
  label: string,
  value_type: "string" | "number" | "boolean" | "date",
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

export const RH_ATTENDANCE_REPORTING_SOURCES = ["rh.attendance"] as const;
export type RhAttendanceReportingSource = (typeof RH_ATTENDANCE_REPORTING_SOURCES)[number];

export const rhAttendanceReportingCatalog = {
  sources: [
    {
      key: "rh.attendance",
      label: "Frequência e ponto",
      module: "rh",
      minimum_permission: 1,
      keys: [
        field("user_id", "Usuário", "string", ["eq", "in"]),
        field("point_id", "Apontamento", "string", ["eq", "in"]),
        field("approver_user_id", "Aprovador", "string", ["eq", "in"]),
      ],
      fields: [
        field("date", "Data", "date", dateOperators),
        field("start_time", "Início", "date", dateOperators),
        field("end_time", "Fim", "date", dateOperators),
        field("clock_in", "Entrada", "date", dateOperators),
        field("lunch_out", "Saída para almoço", "date", dateOperators),
        field("lunch_in", "Retorno do almoço", "date", dateOperators),
        field("clock_out", "Saída", "date", dateOperators),
        field("workload_hours", "Carga trabalhada", "number", numberOperators),
        field("worked_minutes", "Minutos trabalhados", "number", numberOperators),
        field("expected_minutes", "Minutos previstos", "number", numberOperators),
        field("balance_minutes", "Saldo em minutos", "number", numberOperators),
        field("time_bank_balance", "Saldo do banco de horas", "number", numberOperators),
        field("minutes", "Minutos lançados", "number", numberOperators),
        field("is_approved", "Aprovado", "boolean", ["eq", "neq"]),
        field("status", "Status", "string", stringOperators),
      ],
    },
  ],
  relations: [],
} as const;

export function getRhAttendanceReportingFields(
  source: RhAttendanceReportingSource,
): readonly string[] {
  return (
    rhAttendanceReportingCatalog.sources
      .find((candidate) => candidate.key === source)
      ?.fields.map((candidate) => candidate.key) ?? []
  );
}
