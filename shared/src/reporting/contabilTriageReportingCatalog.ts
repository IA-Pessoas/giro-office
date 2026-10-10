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

// Mesmos campos de cliente e de serviço contratado nas duas áreas: o filtro vale igual em ambas.
const clientFields = [
  field("legal_name", "Razão social", "string", stringOperators),
  field("trade_name", "Nome fantasia", "string", stringOperators),
  field("cpf_cnpj", "CPF/CNPJ", "string", stringOperators),
  field("entry_date", "Data de entrada", "date", dateOperators),
  field("contabil", "Serviço Contábil", "boolean", booleanOperators),
  field("fiscal", "Serviço Fiscal", "boolean", booleanOperators),
] as const;

export const CONTABIL_TRIAGE_REPORTING_SOURCES = [
  "contabil.triage_clouds",
  "contabil.triage_movement",
] as const;
export type ContabilTriageReportingSource = (typeof CONTABIL_TRIAGE_REPORTING_SOURCES)[number];

export const contabilTriageReportingCatalog = {
  sources: [
    {
      key: "contabil.triage_clouds",
      label: "Clouds dos clientes",
      module: "triagem",
      minimum_permission: 1,
      keys: [field("client_id", "Cliente", "string", ["eq", "in"])],
      fields: [
        field("type", "Tipo de Cloud", "string", stringOperators),
        field("link", "Link da Cloud", "string", stringOperators),
        ...clientFields,
      ],
    },
    {
      key: "contabil.triage_movement",
      label: "Movimento Contábil da Triagem",
      module: "triagem",
      minimum_permission: 1,
      keys: [field("client_id", "Cliente", "string", ["eq", "in"])],
      fields: [
        field("competence", "Competência", "string", stringOperators),
        field("sends_movement", "Envia movimento", "boolean", booleanOperators),
        ...clientFields,
      ],
    },
  ],
  relations: [],
} as const;
