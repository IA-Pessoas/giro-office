import { reportingAggregations } from "./reportingCapabilities.js";

const stringOperators = ["eq", "neq", "contains", "in"] as const;
const dateOperators = ["eq", "neq", "gt", "gte", "lt", "lte", "between"] as const;
const booleanOperators = ["eq", "neq"] as const;
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

export const REGULARIZE_CLIENTS_REPORTING_SOURCE = "regularize.clients";
export const REGULARIZE_CLIENT_GROUPS_REPORTING_SOURCE = "regularize.client_groups";
export const REGULARIZE_CLIENTS_PF_REPORTING_SOURCE = "regularize.clients_pf";
export const REGULARIZE_PARTNERS_REPORTING_SOURCE = "regularize.partners";
export const REGULARIZE_PORTFOLIO_REPORTING_SOURCES = [
  REGULARIZE_CLIENTS_REPORTING_SOURCE,
  REGULARIZE_CLIENT_GROUPS_REPORTING_SOURCE,
  REGULARIZE_CLIENTS_PF_REPORTING_SOURCE,
  REGULARIZE_PARTNERS_REPORTING_SOURCE,
] as const;
export type RegularizePortfolioReportingSource =
  (typeof REGULARIZE_PORTFOLIO_REPORTING_SOURCES)[number];

// Estado legado P (tb_regularize.clientes.situacao) é o cliente em processo de inativação.
export const REGULARIZE_PORTFOLIO_LEGACY_STATUS: Readonly<Record<string, string>> = {
  A: "Ativo",
  I: "Inativo",
  P: "Processo de Inativação",
};

// Campos do cliente compartilhados pelas duas fontes: filtros e totais valem igual em ambas.
const clientFields = [
  field("name", "Nome", "string", stringOperators),
  field("company_name", "Razão social", "string", stringOperators),
  field("fantasy_name", "Nome fantasia", "string", stringOperators),
  field("cpf_cnpj", "CPF/CNPJ", "string", stringOperators),
  field("dominio_code", "Código", "string", stringOperators),
  field("status", "Status", "string", stringOperators),
  field("type", "Tipo", "string", stringOperators),
  field("customer_since", "Entrada", "date", dateOperators),
  field("deletion_date", "Saída", "date", dateOperators),
  field("competence_output", "Competência de saída", "date", dateOperators),
  field("regime", "Regime", "string", stringOperators),
  field("segment", "Segmento", "string", stringOperators),
  field("segment_type", "Tipo de segmento", "string", stringOperators),
  field("size", "Porte", "string", stringOperators),
  field("city", "Cidade", "string", stringOperators),
  field("state", "Estado", "string", stringOperators),
  field("licitacao", "Faz licitação", "boolean", booleanOperators),
  field("contabil", "Departamento Contábil", "boolean", booleanOperators),
  field("fiscal", "Departamento Fiscal", "boolean", booleanOperators),
  field("pessoal", "Departamento Pessoal", "boolean", booleanOperators),
  field("consultoria", "Consultoria", "boolean", booleanOperators),
  field("infoproduto", "Infoproduto", "boolean", booleanOperators),
  field("tecnologia", "Tecnologia", "boolean", booleanOperators),
  field("castelo_med", "Castelo Med", "boolean", booleanOperators),
  field("responsible", "Responsável", "string", stringOperators),
  field("email", "E-mail", "string", stringOperators),
  field("number", "Telefone", "string", stringOperators),
  field("coringa_status", "Cadastro Coringa", "string", stringOperators),
  field("has_passwords", "Possui senhas", "boolean", booleanOperators),
  field("has_partners", "Possui sócios", "boolean", booleanOperators),
] as const;

export const regularizePortfolioReportingCatalog = {
  sources: [
    {
      key: REGULARIZE_CLIENTS_REPORTING_SOURCE,
      label: "Carteira de clientes do Regularize",
      module: "regularize",
      minimum_permission: 1,
      keys: [field("client_id", "Cliente", "string", ["eq", "in"])],
      fields: clientFields,
    },
    {
      key: REGULARIZE_CLIENT_GROUPS_REPORTING_SOURCE,
      label: "Grupos de clientes do Regularize",
      module: "regularize",
      minimum_permission: 1,
      keys: [field("client_id", "Cliente", "string", ["eq", "in"])],
      fields: [
        field("group_name", "Grupo", "string", stringOperators),
        field("group_active", "Grupo ativo", "boolean", booleanOperators),
        ...clientFields,
      ],
    },
    {
      key: REGULARIZE_CLIENTS_PF_REPORTING_SOURCE,
      label: "Clientes PF do Regularize",
      module: "regularize",
      minimum_permission: 1,
      keys: [field("client_pf_id", "Cliente PF", "string", ["eq", "in"])],
      fields: [
        field("code", "Código", "string", stringOperators),
        field("name", "Nome", "string", stringOperators),
        field("cpf", "CPF", "string", stringOperators),
        field("rg", "Identidade", "string", stringOperators),
        field("sex", "Sexo", "string", stringOperators),
        field("status", "Status", "string", stringOperators),
        field("date_of_birth", "Nascimento", "date", dateOperators),
        field("birth_month", "Mês de aniversário", "number", numberOperators),
        field("city", "Cidade", "string", stringOperators),
        field("state", "Estado", "string", stringOperators),
        // Sócio sem saída em alguma empresa; "sem empresa" do legado é o valor falso.
        field("has_company", "Possui empresa", "boolean", booleanOperators),
        // Situação Ativo/Inativo do legado: sócio vigente de empresa com status Ativo.
        field("has_active_company", "Possui empresa ativa", "boolean", booleanOperators),
      ],
    },
    {
      key: REGULARIZE_PARTNERS_REPORTING_SOURCE,
      label: "Sócios do Regularize",
      module: "regularize",
      minimum_permission: 1,
      keys: [
        field("client_pj_id", "Cliente PJ", "string", ["eq", "in"]),
        field("client_pf_id", "Cliente PF", "string", ["eq", "in"]),
      ],
      fields: [
        field("partner_name", "Sócio", "string", stringOperators),
        field("partner_cpf", "CPF do sócio", "string", stringOperators),
        field("partner_sex", "Sexo do sócio", "string", stringOperators),
        field("company_name", "Empresa", "string", stringOperators),
        field("company_cpf_cnpj", "CPF/CNPJ da empresa", "string", stringOperators),
        field("company_status", "Status da empresa", "string", stringOperators),
        field("entry", "Entrada", "date", dateOperators),
        field("exit", "Saída", "date", dateOperators),
        field("active", "Vínculo vigente", "boolean", booleanOperators),
        field("part", "Participação", "number", numberOperators),
      ],
    },
  ],
  relations: [],
} as const;

export function getRegularizePortfolioReportingFields(
  source: RegularizePortfolioReportingSource,
): readonly string[] {
  return (
    regularizePortfolioReportingCatalog.sources
      .find((candidate) => candidate.key === source)
      ?.fields.map((candidate) => candidate.key) ?? []
  );
}
