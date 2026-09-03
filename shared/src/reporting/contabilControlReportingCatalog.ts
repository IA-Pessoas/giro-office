const booleanOperators = ["eq", "neq"] as const;

function field(key: string, label: string, value_type: "string" | "boolean") {
  return {
    key,
    label,
    value_type,
    filter_operators: value_type === "boolean" ? booleanOperators : ["eq", "neq", "in"],
    aggregations: [],
  };
}

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
      fields: [
        field("competence", "Competência", "string"),
        field("regenerate_accounting_entries", "Regenerar lançamentos", "boolean"),
        field("check_summary_by_accumulator", "Conferir resumo por acumulador", "boolean"),
        field("post_accounting_transaction", "Lançar transação contábil", "boolean"),
        field("import_bank_statements", "Importar extratos bancários", "boolean"),
        field("reconcile_bank_statements", "Conciliar extratos bancários", "boolean"),
        field("reconcile_vendors", "Conciliar fornecedores", "boolean"),
        field("integrate_taxes", "Integrar impostos", "boolean"),
        field("settle_federal_taxes_via_ecac", "Liquidar tributos federais", "boolean"),
        field("settle_state_taxes_via_sefaz_ba", "Liquidar tributos estaduais", "boolean"),
        field("integrate_payroll", "Integrar folha", "boolean"),
        field("suspense_accounts", "Contas transitórias", "boolean"),
        field("check_overdrawn_accounts", "Conferir contas descobertas", "boolean"),
        field("general_account_reconciliation", "Conciliação contábil geral", "boolean"),
        field("check_loan_and_interest_accounts", "Conferir empréstimos e juros", "boolean"),
        field("monthly_closing", "Fechamento mensal", "boolean"),
        field("reconcile_icms_pis_cofins", "Conciliar ICMS, PIS e COFINS", "boolean"),
        field("depreciation", "Depreciação", "boolean"),
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
