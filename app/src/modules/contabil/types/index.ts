export type ContabilCompetence = `${number}-${number}`;
export type TriageRoutineType = "CONTABIL" | "FISCAL";

export type ContabilControlChecklistField =
  | "regenerate_accounting_entries"
  | "check_summary_by_accumulator"
  | "post_accounting_transaction"
  | "import_bank_statements"
  | "reconcile_bank_statements"
  | "reconcile_vendors"
  | "integrate_taxes"
  | "settle_federal_taxes_via_ecac"
  | "settle_state_taxes_via_sefaz_ba"
  | "integrate_payroll"
  | "suspense_accounts"
  | "check_overdrawn_accounts"
  | "general_account_reconciliation"
  | "check_loan_and_interest_accounts"
  | "monthly_closing"
  | "reconcile_icms_pis_cofins"
  | "depreciation";

export type ContabilControlField = ContabilControlChecklistField | "notes";

export interface ContabilControl {
  id: string;
  client_id: string;
  competence: ContabilCompetence;
  regenerate_accounting_entries: boolean;
  check_summary_by_accumulator: boolean;
  post_accounting_transaction: boolean;
  import_bank_statements: boolean;
  reconcile_bank_statements: boolean;
  reconcile_vendors: boolean;
  integrate_taxes: boolean;
  settle_federal_taxes_via_ecac: boolean;
  settle_state_taxes_via_sefaz_ba: boolean;
  integrate_payroll: boolean;
  suspense_accounts: boolean;
  check_overdrawn_accounts: boolean;
  general_account_reconciliation: boolean;
  check_loan_and_interest_accounts: boolean;
  monthly_closing: boolean;
  reconcile_icms_pis_cofins: boolean;
  depreciation: boolean;
  notes: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface ContabilResponsible {
  id: string;
  client_id: string;
  person_responsible_id: string | null;
  posted_by_id: string | null;
  customer_with_movement: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
  [field: string]: string | boolean | null | undefined;
}

export interface ContabilRelationship {
  id: string;
  client_id: string;
  bidding: boolean;
  chart_accounts: string;
  tool: string;
  system: string;
  note: string;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface ContabilControlFilters {
  clientId: string;
  competence: ContabilCompetence;
}

export interface ContabilControlPortfolioItem {
  client_id: string;
  legal_name: string;
  cpf_cnpj: string;
  regime: string | null;
  person_responsible_id: string | null;
  posted_by_id: string | null;
  control: ContabilControl | null;
  closing: TriageClosing;
}

export interface ContabilControlPortfolio {
  competence: ContabilCompetence;
  items: ContabilControlPortfolioItem[];
}

export interface CreateOrGetContabilControlPayload {
  client_id: string;
  competence: ContabilCompetence;
}

export interface PatchContabilControlFieldPayload {
  field: ContabilControlField;
  value: boolean | string | null;
}

export interface CreateYearContabilControlsPayload {
  client_id: string;
  year: number;
  confirmed: true;
}

export interface ContabilCompetenceOperationPayload {
  client_id: string;
  competence: ContabilCompetence;
}

export interface CreateContabilResponsiblePayload {
  client_id: string;
  person_responsible_id?: string | null;
  posted_by_id?: string | null;
  customer_with_movement?: boolean | null;
  [field: string]: string | boolean | null | undefined;
}

export interface UpdateContabilResponsiblePayload {
  person_responsible_id?: string | null;
  posted_by_id?: string | null;
  customer_with_movement?: boolean | null;
  [field: string]: string | boolean | null | undefined;
}

export interface DeleteContabilResponsiblePayload {
  id: string;
}

export interface CreateContabilRelationshipPayload {
  client_id: string;
  bidding: boolean;
  chart_accounts: string;
  tool: string;
  system: string;
  note: string;
}

export interface UpdateContabilRelationshipPayload {
  bidding?: boolean;
  chart_accounts?: string;
  tool?: string;
  system?: string;
  note?: string;
}

export interface DeleteContabilRelationshipPayload {
  id: string;
}

export type TriageDocumentStatus =
  | "PENDING"
  | "COMPLETED"
  | "ATTENTION"
  | "UNDER_REVIEW"
  | "NOT_PRESENT"
  | "NOT_APPLICABLE";

export type TriageDocumentField =
  | "financial_transactions"
  | "triaged_transactions"
  | "inventory_control"
  | "accounts_payable_report"
  | "accounts_receivable_report"
  | "card_statements"
  | "loan_agreements"
  | "bank_reconciliation"
  | "bank_investments"
  | "card_sales_report";

export type TriageFiscalChecklistField =
  | "inbound_report"
  | "outbound_report"
  | "nfse_provided"
  | "nfse_received"
  | "cte_documents"
  | "mei_documents"
  | "nfce_documents"
  | "sped_fiscal"
  | "sped_contributions"
  | "nfce_received"
  | "model_21_invoice"
  | "cte_as_issuer"
  | "services_provided_as_mei";

export type TriageFiscalField = TriageFiscalChecklistField | "billing_amount";

export type TriageDeliveryMethod = string;
export type TriageItemPriority = "LOW" | "MEDIUM" | "HIGH";

export interface TriageDocumentItemNotes {
  note: string | null;
  justification: string | null;
  priority?: TriageItemPriority | null;
  delivery_method?: TriageDeliveryMethod | null;
  state_site?: string | null;
  required?: boolean;
}

export interface TriageDocumentsMonthly {
  id: string;
  client_id: string;
  competence: ContabilCompetence;
  type: TriageRoutineType;
  billing_amount?: string | null;
  checklist: Record<string, TriageDocumentStatus>;
  item_notes: Record<string, TriageDocumentItemNotes>;
  summary: { applicable: number; completed: number; attention: number; pending: number; notApplicable: number; notPresent: number; percentage: number };
}

export interface TriageBankStatement {
  id: string;
  bank_id: string;
  status: TriageDocumentStatus;
  archived_at: string | null;
}

export type TriageClosingStatus =
  | "NOT_RECEIVED"
  | "RECEIVED"
  | "UNDER_REVIEW"
  | "CLOSED"
  | "REOPENED";

export interface TriageClosing {
  id?: string;
  client_id: string;
  competence: ContabilCompetence;
  status: TriageClosingStatus;
  archived_at: string | null;
}
