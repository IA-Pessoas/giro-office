export type ContabilCompetence = `${number}-${number}`;

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
  | "NOT_PRESENT"
  | "NOT_APPLICABLE";

export interface TriageDocumentsMonthly {
  id: string;
  client_id: string;
  competence: ContabilCompetence;
  checklist: Record<string, TriageDocumentStatus>;
  summary: { applicable: number; completed: number; attention: number; pending: number; notApplicable: number; notPresent: number; percentage: number };
}

export interface TriageBankStatement {
  id: string;
  bank_id: string;
  status: TriageDocumentStatus;
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
