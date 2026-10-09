import { reportingAggregations } from "./reportingCapabilities.js";

const noFilterOperators: readonly string[] = [];
const textOperators = ["eq", "neq", "contains", "in"] as const;
const snapshotStateOperators = ["eq", "in"] as const;

function field(
  key: string,
  label: string,
  value_type: "string" | "boolean",
  filter_operators: readonly string[],
): {
  key: string;
  label: string;
  value_type: "string" | "boolean";
  filter_operators: readonly string[];
  aggregations: readonly string[];
  groupable: boolean;
  sortable: boolean;
} {
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

// Estado derivado de cada item: true = CONCLUIDO, false = PENDENTE, null = NAO_POSSUI.
const OBLIGATION_ITEMS = [
  ["advance", "Adiantamento"],
  ["payroll", "Folha"],
  ["charges", "Encargos"],
  ["assistance_fee", "Taxa assistencial"],
  ["bem_mais", "Bem Mais"],
  ["bsf", "BSF"],
  ["va", "Vale-alimentação"],
  ["vt", "Vale-transporte"],
] as const;

export const PESSOAL_OBLIGATIONS_REPORTING_SOURCES = ["pessoal.obligations"] as const;
export type PessoalObligationsReportingSource =
  (typeof PESSOAL_OBLIGATIONS_REPORTING_SOURCES)[number];

export const pessoalObligationsReportingCatalog = {
  sources: [
    {
      key: "pessoal.obligations",
      label: "Obrigações de Departamento Pessoal",
      module: "pessoal",
      minimum_permission: 1,
      keys: [
        field("client_id", "Cliente", "string", ["eq", "in"]),
        field("responsavel_id", "Responsável", "string", ["eq", "in"]),
      ],
      fields: [
        field("competence", "Competência", "string", textOperators),
        field("client_name", "Cliente", "string", textOperators),
        field("client_code", "Código do cliente", "string", textOperators),
        field("client_document", "CPF/CNPJ do cliente", "string", textOperators),
        field("client_status", "Situação do cliente", "string", snapshotStateOperators),
        field("responsible_name", "Responsável", "string", textOperators),
        field("group_snapshot_name", "Grupo registrado", "string", textOperators),
        field("group_snapshot_policy", "Política do grupo registrada", "string", textOperators),
        field(
          "group_snapshot_state",
          "Estado do grupo registrado",
          "string",
          snapshotStateOperators,
        ),
        field("advance", "Adiantamento", "boolean", noFilterOperators),
        field("payroll", "Folha", "boolean", noFilterOperators),
        field("charges", "Encargos", "boolean", noFilterOperators),
        field("assistance_fee", "Taxa assistencial", "boolean", noFilterOperators),
        field("bem_mais", "Bem Mais", "boolean", noFilterOperators),
        field("bsf", "BSF", "boolean", noFilterOperators),
        field("va", "Vale-alimentação", "boolean", noFilterOperators),
        field("vt", "Vale-transporte", "boolean", noFilterOperators),
        ...OBLIGATION_ITEMS.map(([item, label]) =>
          field(`${item}_state`, `${label} (estado)`, "string", snapshotStateOperators),
        ),
      ],
    },
  ],
  relations: [],
} as const;

export function getPessoalObligationsReportingFields(
  source: PessoalObligationsReportingSource,
): readonly string[] {
  return (
    pessoalObligationsReportingCatalog.sources
      .find((candidate) => candidate.key === source)
      ?.fields.map((candidate) => candidate.key) ?? []
  );
}
