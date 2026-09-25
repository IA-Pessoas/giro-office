import { reportingAggregations } from "./reportingCapabilities.js";

const stringOperators = ["eq", "neq", "contains", "in"] as const;
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

export const CLIENT_INTEGRATION_REPORTING_SOURCES = ["integracao.clients"] as const;
export type ClientIntegrationReportingSource =
  (typeof CLIENT_INTEGRATION_REPORTING_SOURCES)[number];

export const clientIntegrationReportingCatalog = {
  sources: [
    {
      key: "integracao.clients",
      label: "Clientes de Integração",
      module: "integracao",
      minimum_permission: 1,
      keys: [field("client_id", "Cliente", "string", ["eq", "in"])],
      fields: [
        field("name", "Nome", "string", stringOperators),
        field("company_name", "Razão social", "string", stringOperators),
        field("fantasy_name", "Nome fantasia", "string", stringOperators),
        field("cpf_cnpj", "CPF/CNPJ", "string", stringOperators),
        field("status", "Status", "string", stringOperators),
        field("type", "Tipo", "string", stringOperators),
        field("type_registration", "Tipo de cadastro", "string", stringOperators),
        field("prospecting_status", "Status de prospecção", "string", stringOperators),
        field("city", "Cidade", "string", stringOperators),
        field("state", "Estado", "string", stringOperators),
        field("segment", "Segmento", "string", stringOperators),
        field("regime", "Regime", "string", stringOperators),
        field("service_unique", "Serviço único", "boolean", booleanOperators),
      ],
    },
  ],
  relations: [],
} as const;

export function getClientIntegrationReportingFields(
  source: ClientIntegrationReportingSource,
): readonly string[] {
  return (
    clientIntegrationReportingCatalog.sources
      .find((candidate) => candidate.key === source)
      ?.fields.map((candidate) => candidate.key) ?? []
  );
}
