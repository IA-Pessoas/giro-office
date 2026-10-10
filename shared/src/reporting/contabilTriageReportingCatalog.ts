import { reportingAggregations } from "./reportingCapabilities.js";

const stringOperators = ["eq", "neq", "contains", "in"] as const;
const dateOperators = ["eq", "gt", "gte", "lt", "lte", "between"] as const;
const booleanOperators = ["eq", "neq"] as const;
const numberOperators = ["eq", "neq", "gt", "gte", "lt", "lte", "between"] as const;
// Competência é YYYY-MM: a ordem do texto é a do calendário, então intervalo funciona.
const competenceOperators = [...stringOperators, "gte", "lte", "between"] as const;

function field(
  key: string,
  label: string,
  value_type: "string" | "boolean" | "date" | "number",
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
  field("deletion_date", "Data de inativação", "date", dateOperators),
  field("contabil", "Serviço Contábil", "boolean", booleanOperators),
  field("fiscal", "Serviço Fiscal", "boolean", booleanOperators),
  field("customer_with_movement", "Cliente com movimento", "boolean", booleanOperators),
] as const;

export const CONTABIL_TRIAGE_REPORTING_SOURCES = [
  "contabil.triage_clouds",
  "contabil.triage_movement",
  "contabil.triage_responsibles",
  "contabil.triage_competence_responsibles",
  "contabil.triage_accounting_metric",
  "contabil.triage_sgq",
  "contabil.triage_fiscal_special_documents",
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
        field("competence", "Competência", "string", competenceOperators),
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
        field("competence", "Competência", "string", competenceOperators),
        field("type", "Serviço da Triagem", "string", stringOperators),
        field("responsible_name", "Responsável", "string", stringOperators),
        ...clientFields,
      ],
    },
    {
      key: "contabil.triage_accounting_metric",
      label: "Métrica Contábil por competência",
      module: "triagem",
      minimum_permission: 1,
      keys: [field("client_id", "Cliente", "string", ["eq", "in"])],
      fields: [
        field("competence", "Competência", "string", competenceOperators),
        field("completion_percent", "Concluído (%)", "number", numberOperators),
        field("completed_items", "Itens concluídos", "number", numberOperators),
        field("applicable_items", "Itens aplicáveis", "number", numberOperators),
        field("responsible_name", "Responsável", "string", stringOperators),
        ...clientFields,
      ],
    },
    {
      key: "contabil.triage_sgq",
      label: "SGQ da Triagem por mês",
      module: "triagem",
      minimum_permission: 1,
      keys: [],
      fields: [
        field("competence", "Mês", "string", competenceOperators),
        field("not_sent", "Clientes não enviado", "number", numberOperators),
        field("not_triaged", "Clientes não triado", "number", numberOperators),
        field("triaged", "Clientes triado", "number", numberOperators),
        field("eligible_clients", "Clientes na carteira", "number", numberOperators),
      ],
    },
    {
      key: "contabil.triage_fiscal_special_documents",
      label: "Documentos fiscais especiais por competência",
      module: "triagem",
      minimum_permission: 1,
      keys: [field("client_id", "Cliente", "string", ["eq", "in"])],
      fields: [
        field("competence", "Competência", "string", competenceOperators),
        // Uma coluna por documento especial, com o estado dele no checklist Fiscal.
        field("nfce_documents", "Documentos NFCe", "string", stringOperators),
        field("sped_fiscal", "SPED Fiscal", "string", stringOperators),
        field("sped_contributions", "SPED Contribuições", "string", stringOperators),
        field("nfse_received", "NFSe recebidos", "string", stringOperators),
        field("model_21_invoice", "Nota fiscal modelo 21", "string", stringOperators),
        field("cte_as_issuer", "CTe como emitente", "string", stringOperators),
        field("services_provided_as_mei", "Serviços prestados como MEI", "string", stringOperators),
        field("billing_status", "Situação do faturamento", "string", stringOperators),
        field("billing_amount", "Faturamento", "string", stringOperators),
        field("delivery_method", "Meio de envio", "string", stringOperators),
        field("responsible_name", "Responsável", "string", stringOperators),
        ...clientFields,
      ],
    },
  ],
  relations: [],
} as const;
