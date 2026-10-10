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

// Mesmos campos de cliente, serviço contratado e movimento em todas as áreas: o filtro vale
// igual em cada uma.
const clientFields = [
  field("name", "Nome", "string", stringOperators),
  field("company_name", "Razão social", "string", stringOperators),
  field("cpf_cnpj", "CPF/CNPJ", "string", stringOperators),
  field("status", "Status do cliente", "string", stringOperators),
  field("regime", "Regime", "string", stringOperators),
  field("competence_entry", "Data de entrada", "date", dateOperators),
  field("contabil", "Serviço Contábil", "boolean", booleanOperators),
  field("fiscal", "Serviço Fiscal", "boolean", booleanOperators),
  field("customer_with_movement", "Cliente com movimento", "boolean", booleanOperators),
] as const;

export const CONTABIL_TRIAGE_REPORTING_SOURCES = [
  "contabil.triage_clouds",
  "contabil.triage_movement",
  "contabil.triage_responsibles",
  "contabil.triage_competence_responsibles",
] as const;
export type ContabilTriageReportingSource = (typeof CONTABIL_TRIAGE_REPORTING_SOURCES)[number];

export const contabilTriageReportingCatalog = {
  sources: [
    {
      key: "contabil.triage_clouds",
      label: "Clouds e movimentação dos clientes",
      module: "triagem",
      minimum_permission: 1,
      keys: [field("client_id", "Cliente", "string", ["eq", "in"])],
      fields: [
        ...clientFields,
        field("cloud_types", "Tipos de Cloud", "string", stringOperators),
        field("clouds", "Clouds (tipo e link)", "string", stringOperators),
      ],
    },
    {
      key: "contabil.triage_movement",
      label: "Movimento Contábil por competência",
      module: "triagem",
      minimum_permission: 1,
      keys: [field("client_id", "Cliente", "string", ["eq", "in"])],
      fields: [
        field("competence", "Competência", "string", stringOperators),
        field("sends_movement", "Movimento enviado", "boolean", booleanOperators),
        ...clientFields,
      ],
    },
    {
      key: "contabil.triage_responsibles",
      label: "Responsáveis da Triagem",
      module: "triagem",
      minimum_permission: 1,
      keys: [field("client_id", "Cliente", "string", ["eq", "in"])],
      fields: [
        field("type", "Serviço da Triagem", "string", stringOperators),
        field("responsible_name", "Responsável", "string", stringOperators),
        ...clientFields,
      ],
    },
    {
      key: "contabil.triage_competence_responsibles",
      label: "Responsáveis da Triagem por competência",
      module: "triagem",
      minimum_permission: 1,
      keys: [field("client_id", "Cliente", "string", ["eq", "in"])],
      fields: [
        field("competence", "Competência", "string", stringOperators),
        field("type", "Serviço da Triagem", "string", stringOperators),
        field("responsible_name", "Responsável", "string", stringOperators),
        ...clientFields,
      ],
    },
  ],
  relations: [],
} as const;
