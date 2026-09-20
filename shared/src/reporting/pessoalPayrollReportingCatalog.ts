import { reportingAggregations } from "./reportingCapabilities.js";

const textOperators = ["eq", "neq", "contains", "in"] as const;
const groupStateOperators = ["eq", "in"] as const;

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
        field("responsible_name", "Responsável", "string", textOperators),
        field("union_name", "Sindicato", "string", textOperators),
        field("group_name", "Grupo", "string", textOperators),
        field("group_state", "Estado do grupo", "string", groupStateOperators),
        field("advance", "Adiantamento", "boolean"),
        field("advance_type", "Tipo de adiantamento", "string"),
        field("advance_amount", "Valor do adiantamento", "number"),
        field("onvio", "Envio via Onvio", "boolean"),
        field("vt", "Vale-transporte", "boolean"),
        field("vt_value", "Valor do vale-transporte", "number"),
        field("vt_type", "Tipo do vale-transporte", "string"),
        field("va", "Vale-alimentação", "boolean"),
        field("assistance_fee", "Taxa assistencial", "boolean"),
        field("bem_mais", "Bem Mais", "boolean"),
        field("bsf", "BSF", "boolean"),
        field("reinf", "Reinf", "boolean"),
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
