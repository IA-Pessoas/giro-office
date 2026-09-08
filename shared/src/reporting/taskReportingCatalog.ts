import { reportingAggregations } from "./reportingCapabilities.js";

const stringOperators = ["eq", "neq", "contains", "in"] as const;
const dateOperators = ["eq", "gt", "gte", "lt", "lte", "between"] as const;
const booleanOperators = ["eq", "neq"] as const;

function field(
  key: string,
  label: string,
  value_type: "string" | "boolean" | "date",
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

export const TASK_REPORTING_SOURCES = ["integracao.tasks"] as const;
export type TaskReportingSource = (typeof TASK_REPORTING_SOURCES)[number];

export const taskReportingCatalog = {
  sources: [
    {
      key: "integracao.tasks",
      label: "Tarefas de Integração",
      module: "integracao",
      minimum_permission: 1,
      keys: [
        field("project_id", "Projeto", "string", ["eq", "in"]),
        field("client_id", "Cliente", "string", ["eq", "in"]),
        field("model_id", "Modelo", "string", ["eq", "in"]),
        field("responsible_id", "Responsável principal", "string", ["eq", "in"]),
        field("responsible2_id", "Responsável secundário", "string", ["eq", "in"]),
        field("responsible3_id", "Responsável terciário", "string", ["eq", "in"]),
      ],
      fields: [
        field("name", "Nome", "string", stringOperators),
        field("status", "Status", "string", stringOperators),
        field("department", "Departamento", "string", stringOperators),
        field("billing", "Cobrança", "string", stringOperators),
        field("urgency", "Urgência", "string", stringOperators),
        field("start_date", "Data de início", "date", dateOperators),
        field("prevision_date", "Data prevista", "date", dateOperators),
        field("end_date", "Data de término", "date", dateOperators),
        field("date_created", "Data de criação", "date", dateOperators),
        field("date_updated", "Data de atualização", "date", dateOperators),
        field("pending_approval", "Pendente de aprovação", "boolean", booleanOperators),
        field("charge_comercial", "Cobrança comercial", "boolean", booleanOperators),
        field("charge_financeiro", "Cobrança financeira", "boolean", booleanOperators),
      ],
    },
  ],
  relations: [],
} as const;

export function getTaskReportingFields(source: TaskReportingSource): readonly string[] {
  return (
    taskReportingCatalog.sources
      .find((candidate) => candidate.key === source)
      ?.fields.map((candidate) => candidate.key) ?? []
  );
}
