import { contabilClientReportingFields } from "./contabilTriageReportingCatalog.js";
import { reportingAggregations } from "./reportingCapabilities.js";

const booleanOperators = ["eq", "neq"] as const;
const stringOperators = ["eq", "neq", "contains", "in"] as const;
const numberOperators = ["eq", "neq", "gt", "gte", "lt", "lte", "between"] as const;
// Competência é YYYY-MM: a ordem do texto é a do calendário, então intervalo funciona.
const competenceOperators = [...stringOperators, "gte", "lte", "between"] as const;

function field(
  key: string,
  label: string,
  value_type: "string" | "boolean" | "number",
  filter_operators: readonly string[] = value_type === "boolean"
    ? booleanOperators
    : ["eq", "neq", "in"],
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

// As 17 etapas próprias do Controle, com os rótulos da tela: o percentual concluído é sobre
// esta lista.
const stepFields = [
  field("regenerate_accounting_entries", "Regerar lançamentos contábeis", "boolean"),
  field("check_summary_by_accumulator", "Conferir resumo por acumulador", "boolean"),
  field("post_accounting_transaction", "Lançar movimento contábil", "boolean"),
  field("import_bank_statements", "Importar extratos bancários", "boolean"),
  field("reconcile_bank_statements", "Conciliar extratos bancários", "boolean"),
  field("reconcile_vendors", "Conciliar fornecedores", "boolean"),
  field("integrate_taxes", "Integrar impostos", "boolean"),
  field("settle_federal_taxes_via_ecac", "Baixar impostos federais via e-CAC", "boolean"),
  field("settle_state_taxes_via_sefaz_ba", "Baixar impostos estaduais via SEFAZ BA", "boolean"),
  field("integrate_payroll", "Integrar folha", "boolean"),
  field("suspense_accounts", "Contas transitórias", "boolean"),
  field("check_overdrawn_accounts", "Verificar contas negativas", "boolean"),
  field("general_account_reconciliation", "Conciliação geral de contas", "boolean"),
  field("check_loan_and_interest_accounts", "Verificar contas de empréstimos e juros", "boolean"),
  field("monthly_closing", "Fechamento mensal", "boolean"),
  field("reconcile_icms_pis_cofins", "Conciliar ICMS, PIS e COFINS", "boolean"),
  field("depreciation", "Depreciação", "boolean"),
] as const;

export const CONTABIL_CONTROL_STEP_FIELDS: readonly string[] = stepFields.map((step) => step.key);

export const CONTABIL_CONTROL_REPORTING_SOURCES = ["contabil.control"] as const;
export type ContabilControlReportingSource = (typeof CONTABIL_CONTROL_REPORTING_SOURCES)[number];

export const contabilControlReportingCatalog = {
  sources: [
    {
      key: "contabil.control",
      label: "Controle Contábil",
      module: "contabil",
      minimum_permission: 1,
      keys: [field("client_id", "Cliente", "string")],
      // Uma linha por cliente e competência, com o controle vigente (o arquivado fica no
      // histórico).
      fields: [
        field("competence", "Competência", "string", competenceOperators),
        field("completion_percent", "Concluído (%)", "number", numberOperators),
        field("completed_steps", "Etapas concluídas", "number", numberOperators),
        ...stepFields,
        field("notes", "Observações", "string", stringOperators),
        ...contabilClientReportingFields,
      ],
    },
  ],
  relations: [],
} as const;

export function getContabilControlReportingFields(
  source: ContabilControlReportingSource,
): readonly string[] {
  return (
    contabilControlReportingCatalog.sources
      .find((candidate) => candidate.key === source)
      ?.fields.map((candidate) => candidate.key) ?? []
  );
}
