export type ParcelamentoTabId = "dashboard" | "installments" | "competencies" | "panoramas";

export interface ParcelamentoTab {
  id: ParcelamentoTabId;
  label: string;
}

export interface ParcelamentoClientOption {
  id: string;
  name: string;
  document?: string | null;
}

export interface ParcelamentoSuccessEnvelope<T> {
  success: true;
  data: T;
}

export interface ParcelamentoPage<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  has_more: boolean;
}

export interface ParcelamentoListPage<T> extends ParcelamentoPage<T> {
  data: T[];
  pageSize: number;
  hasMore: boolean;
}

export interface ParcelamentoListFilters {
  page?: number;
  page_size?: number;
  client_id?: string;
  status?: string;
  type?: string;
  jurisdiction?: string;
  search?: string;
  competence?: string;
  responsavel_id?: string;
}

export interface ParcelamentoInstallment {
  id: string;
  client_id: string;
  agreement_number: string | null;
  type: string;
  legal_nature: string;
  jurisdiction: string;
  status: string;
  is_automatic_debit: boolean;
  consolidated_total_amount: number;
  first_installment_amount: number;
  current_month_installment_amount: number;
  agreed_installments_count: number;
  down_payment_installments_count: number;
  paid_installments_count: number;
  overdue_installments_count: number;
  remaining_installments_count: number;
  outstanding_balance: number;
  enrollment_date: string | null;
  document_url: string | null;
  situation_shutdown: string | null;
  completion_date: string | null;
}

export interface CreateParcelamentoInstallmentPayload {
  client_id: string;
  agreement_number?: string | null;
  type: string;
  legal_nature: string;
  jurisdiction: string;
  is_automatic_debit: boolean;
  first_installment_amount: number;
  current_month_installment_amount: number;
  agreed_installments_count: number;
  enrollment_date?: string | null;
}

export interface PatchParcelamentoInstallmentPayload {
  agreement_number?: string | null;
  type?: string;
  legal_nature?: string;
  jurisdiction?: string;
  is_automatic_debit?: boolean;
  consolidated_total_amount?: number;
  first_installment_amount?: number;
  current_month_installment_amount?: number;
  agreed_installments_count?: number;
  enrollment_date?: string | null;
  document_url?: string;
  situation_shutdown?: string | null;
  status?: string;
  completion_date?: string | null;
}

export interface ParcelamentoInstallmentCompetency {
  id: string;
  installment_id: string;
  competence: string;
  how_many_paid: number;
  how_many_overdue: number;
  download: boolean;
  download_notes: string | null;
  upload_file: boolean | null;
  is_sent: boolean | null;
  submission_type: string | null;
  notes: string | null;
  installment_amount: number;
}

export interface CreateParcelamentoInstallmentCompetencyPayload {
  competence: string;
  how_many_paid: number;
  how_many_overdue: number;
  download: boolean;
  download_notes?: string | null;
  upload_file?: boolean | null;
  is_sent?: boolean | null;
  submission_type?: string | null;
  notes?: string | null;
  installment_amount: number;
}

export type PatchParcelamentoInstallmentCompetencyPayload = Partial<
  Omit<CreateParcelamentoInstallmentCompetencyPayload, "competence">
>;

export interface ParcelamentoPanorama {
  id: string;
  client_id: string;
  competence: string;
  cnd_municipal: boolean;
  cnd_state: boolean;
  cnd_federal: boolean;
  cnd_fgts: boolean;
  cnd_labor: boolean;
  protests: boolean;
  state_tax_situation: boolean;
  federal_tax_situation: boolean;
  responsavel_id: string | null;
}

export interface CreateParcelamentoPanoramaPayload {
  client_id: string;
  competence: string;
  cnd_municipal?: boolean;
  cnd_state?: boolean;
  cnd_federal?: boolean;
  cnd_fgts?: boolean;
  cnd_labor?: boolean;
  protests?: boolean;
  state_tax_situation?: boolean;
  federal_tax_situation?: boolean;
  responsavel_id?: string | null;
}

export type PatchParcelamentoPanoramaPayload = Partial<
  Omit<CreateParcelamentoPanoramaPayload, "client_id" | "competence">
>;

export interface ParcelamentoPanoramaGenerateResult {
  created: number;
  existing: number;
  totalActiveClients: number;
}
