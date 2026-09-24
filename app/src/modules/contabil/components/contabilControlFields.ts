import type {
  ContabilControlChecklistField,
  ContabilControlField,
} from "../types";

export interface ContabilControlFieldDefinition {
  field: ContabilControlField;
  kind: "boolean" | "notes";
  label: string;
  order: number;
}

export const CONTABIL_CONTROL_FIELDS: ContabilControlFieldDefinition[] = [
  {
    field: "regenerate_accounting_entries",
    label: "Regerar lançamentos contábeis",
    kind: "boolean",
    order: 1,
  },
  {
    field: "check_summary_by_accumulator",
    label: "Conferir resumo por acumulador",
    kind: "boolean",
    order: 2,
  },
  {
    field: "post_accounting_transaction",
    label: "Lançar movimento contábil",
    kind: "boolean",
    order: 3,
  },
  {
    field: "import_bank_statements",
    label: "Importar extratos bancários",
    kind: "boolean",
    order: 4,
  },
  {
    field: "reconcile_bank_statements",
    label: "Conciliar extratos bancários",
    kind: "boolean",
    order: 5,
  },
  {
    field: "reconcile_vendors",
    label: "Conciliar fornecedores",
    kind: "boolean",
    order: 6,
  },
  {
    field: "integrate_taxes",
    label: "Integrar impostos",
    kind: "boolean",
    order: 7,
  },
  {
    field: "settle_federal_taxes_via_ecac",
    label: "Baixar impostos federais via e-CAC",
    kind: "boolean",
    order: 8,
  },
  {
    field: "settle_state_taxes_via_sefaz_ba",
    label: "Baixar impostos estaduais via SEFAZ BA",
    kind: "boolean",
    order: 9,
  },
  {
    field: "integrate_payroll",
    label: "Integrar folha",
    kind: "boolean",
    order: 10,
  },
  {
    field: "suspense_accounts",
    label: "Contas transitórias",
    kind: "boolean",
    order: 11,
  },
  {
    field: "check_overdrawn_accounts",
    label: "Verificar contas negativas",
    kind: "boolean",
    order: 12,
  },
  {
    field: "general_account_reconciliation",
    label: "Conciliação geral de contas",
    kind: "boolean",
    order: 13,
  },
  {
    field: "check_loan_and_interest_accounts",
    label: "Verificar contas de empréstimos e juros",
    kind: "boolean",
    order: 14,
  },
  {
    field: "monthly_closing",
    label: "Fechamento mensal",
    kind: "boolean",
    order: 15,
  },
  {
    field: "reconcile_icms_pis_cofins",
    label: "Conciliar ICMS, PIS e COFINS",
    kind: "boolean",
    order: 16,
  },
  {
    field: "depreciation",
    label: "Depreciação",
    kind: "boolean",
    order: 17,
  },
  {
    field: "notes",
    label: "Observações",
    kind: "notes",
    order: 18,
  },
] as const;

export const CONTABIL_CONTROL_CHECKLIST_FIELDS =
  CONTABIL_CONTROL_FIELDS.filter(
    (field): field is ContabilControlFieldDefinition & {
      field: ContabilControlChecklistField;
      kind: "boolean";
    } => field.kind === "boolean",
  );

export const CONTABIL_CONTROL_NOTES_FIELD = CONTABIL_CONTROL_FIELDS.find(
  (field): field is ContabilControlFieldDefinition & { field: "notes"; kind: "notes" } =>
    field.field === "notes",
);
