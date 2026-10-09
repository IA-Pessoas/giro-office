import { reportingAggregations } from "./reportingCapabilities.js";

const textOperators = ["eq", "neq", "contains", "in"] as const;
const groupStateOperators = ["eq", "in"] as const;
const booleanOperators = ["eq", "neq"] as const;

function field(
  key: string,
  label: string,
  value_type: "string" | "number" | "boolean",
  filter_operators: readonly string[] = [],
) {
  return {
    groupable: true,
    sortable: true,
    key,
    label,
    value_type,
    filter_operators,
    aggregations: reportingAggregations(value_type),
  } as const;
}

export const PESSOAL_PAYROLL_REPORTING_SOURCES = ["pessoal.payroll"] as const;
export type PessoalPayrollReportingSource = (typeof PESSOAL_PAYROLL_REPORTING_SOURCES)[number];

export const pessoalPayrollReportingCatalog = {
  sources: [
    {
      key: "pessoal.payroll",
      label: "Configuração de folha de Departamento Pessoal",
      module: "pessoal",
      minimum_permission: 1,
      keys: [
        field("client_id", "Cliente", "string"),
        field("responsible_id", "Responsável", "string"),
        field("union_id", "Sindicato", "string"),
      ],
      fields: [
        field("client_name", "Cliente", "string", textOperators),
        field("client_code", "Código do cliente", "string", textOperators),
        field("client_document", "CPF/CNPJ do cliente", "string", textOperators),
        field("client_status", "Situação do cliente", "string", groupStateOperators),
        field("responsible_name", "Responsável", "string", textOperators),
        field("union_name", "Sindicato", "string", textOperators),
        field("group_name", "Grupo", "string", textOperators),
        field("group_state", "Estado do grupo", "string", groupStateOperators),
        field("previous", "Prévia", "boolean", booleanOperators),
        field("info", "Informações", "string"),
        field("contact", "Contato", "string"),
        field("advance", "Adiantamento", "boolean", booleanOperators),
        field("advance_type", "Tipo de adiantamento", "string"),
        field("advance_amount", "Valor do adiantamento", "number"),
        field("onvio", "Envio via Onvio", "boolean", booleanOperators),
        field("vt", "Vale-transporte", "boolean", booleanOperators),
        field("vt_value", "Valor do vale-transporte", "number"),
        field("vt_type", "Tipo do vale-transporte", "string"),
        field("va", "Vale-alimentação", "boolean", booleanOperators),
        field("assistance_fee", "Taxa assistencial", "boolean", booleanOperators),
        field("bem_mais", "Bem Mais", "boolean", booleanOperators),
        field("bsf", "BSF", "boolean", booleanOperators),
        field("reinf", "Reinf", "boolean", booleanOperators),
        field("employees", "Quantidade de empregados", "number"),
      ],
    },
  ],
  relations: [],
} as const;

export function getPessoalPayrollReportingFields(
  source: PessoalPayrollReportingSource,
): readonly string[] {
  return (
    pessoalPayrollReportingCatalog.sources
      .find((candidate) => candidate.key === source)
      ?.fields.map((candidate) => candidate.key) ?? []
  );
}
