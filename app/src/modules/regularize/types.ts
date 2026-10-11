import type {
  RegularizeGuidanceBranchData,
  RegularizeGuidanceChecklistCode,
  RegularizeGuidanceChecklistStatus,
  RegularizeGuidanceSnapshot,
  RegularizeGuidanceTargetType,
} from "@workspace/shared/regularize";

export type RegularizeId = string;

export type RegularizeStatus = string | boolean;

export type RegularizeFinancialStatus = "Pendente" | "Regular" | "Bônus" | "Não Contratado";

export type RegularizePartnerType = "pf" | "pj";

export type RegularizeMunicipalTaxType = "TFF" | "TLP" | "TLL";

export type RegularizeOptionalDate = string | undefined;

export type RegularizeIdFilter = {
  id: RegularizeId;
};

export type RegularizePasswordListFilters = {
  client_id: RegularizeId;
};

export type RegularizeSitePasswordListFilters = {
  status: boolean;
  search?: string;
  page?: number;
  limit?: number;
};

export type RegularizeClientPfListFilters = {
  status: string;
  search?: string;
  page?: number;
  limit?: number;
};

export type RegularizePartnerListFilters = {
  type: RegularizePartnerType;
  client_id: RegularizeId;
};

export type RegularizeMunicipalTaxesListFilters = {
  year: number;
  search?: string;
  status?: "Todos" | "Criado" | "Pendente";
  type?: RegularizeMunicipalTaxType;
  page?: number;
  limit?: number;
};

export type RegularizeProcessListFilters = {
  status: string;
  search?: string;
  page?: number;
  limit?: number;
};

export type RegularizeGuidanceListFilters = {
  process_id?: RegularizeId;
  target_type?: RegularizeGuidanceTargetType;
};

export type RegularizeLicenseListFilters = {
  status: string;
  page?: number;
  limit?: number;
};

export type RegularizePasswordSiteSummary = {
  name?: string | null;
  link?: string | null;
  sphere?: string | null;
};

export type RegularizePasswordListItem = {
  id: RegularizeId;
  site_id: RegularizeId;
  notes?: string | null;
  site?: RegularizePasswordSiteSummary | null;
};

export type RegularizePasswordDetail = RegularizePasswordListItem & {
  client_id: RegularizeId;
  login: string;
  password: string;
};

export type CreateRegularizePasswordPayload = {
  client_id: RegularizeId;
  site_id: RegularizeId;
  login: string;
  password: string;
  notes?: string | null;
};

export type UpdateRegularizePasswordPayload = CreateRegularizePasswordPayload & {
  id: RegularizeId;
};

export type RegularizeSitePasswordListItem = {
  id: RegularizeId;
  name: string;
  sphere?: string | null;
  link?: string | null;
  user?: string | null;
  status: boolean;
};

export type RegularizeSitePasswordDetail = RegularizeSitePasswordListItem & {
  password: string;
};

export type CreateRegularizeSitePasswordPayload = {
  name: string;
  sphere: string;
  link?: string | null;
  user: string;
  password: string;
};

export type UpdateRegularizeSitePasswordPayload = CreateRegularizeSitePasswordPayload & {
  id: RegularizeId;
  status: boolean;
};

export type RegularizeClientPfListItem = {
  id: RegularizeId;
  code?: string | null;
  name: string;
  cpf?: string | null;
};

export type RegularizeClientPfDetail = RegularizeClientPfListItem & {
  sex?: string | null;
  address?: string | null;
  city?: string | null;
  zip_code?: string | null;
  state?: string | null;
  profession?: string | null;
  father?: string | null;
  mother?: string | null;
  marital_status?: string | null;
  date_of_birth?: string | null;
  rg?: string | null;
  rg_expedition?: string | null;
  rg_validity?: string | null;
  military_certificate?: string | null;
  ctps?: string | null;
  cnh?: string | null;
  cnh_expedition?: string | null;
  cnh_validity?: string | null;
  spouse?: string | null;
  notes?: string | null;
  status?: string | null;
};

export type CreateRegularizeClientPfPayload = {
  code: string;
  name: string;
  sex: string;
  address: string;
  city: string;
  zip_code: string;
  state: string;
  profession: string;
  father: string;
  mother: string;
  marital_status: string;
  date_of_birth: string;
  cpf: string;
  rg: string;
  rg_expedition?: string;
  rg_validity?: string;
  military_certificate?: string;
  ctps?: string;
  cnh?: string;
  cnh_expedition?: string;
  cnh_validity?: string;
  spouse?: string;
  notes?: string;
  status: string;
};

export type UpdateRegularizeClientPfPayload = CreateRegularizeClientPfPayload & {
  id: RegularizeId;
};

// Mapa gerado de grupo (#1748). Sem capital social nem RBT12: o cadastro não tem esses dados.
export type RegularizeGroupMapCompany = {
  client_id: RegularizeId;
  name: string;
  cpf_cnpj: string | null;
  status: string;
  address: string | null;
  regime: string | null;
};

export type RegularizeGroupMap = {
  group: { id: RegularizeId; name: string };
  cities: Array<{
    name: string;
    partners: Array<{
      pf_id: RegularizeId;
      name: string;
      companies: RegularizeGroupMapCompany[];
    }>;
  }>;
};

// Item do mapa como é desenhado e salvo (#1749). color é a cor de fundo em #rrggbb.
export type RegularizeGroupMapTreeNode = {
  id: string;
  lines: string[];
  color?: string;
  children: RegularizeGroupMapTreeNode[];
};

export type RegularizeSavedGroupMap = {
  tree: RegularizeGroupMapTreeNode;
  updated_at: string;
  updated_by_user_id: RegularizeId;
};

export type RegularizePartner = {
  id: RegularizeId;
  pj_id: RegularizeId;
  pf_id: RegularizeId;
  part?: number | string | null;
  entry?: string | null;
  exit?: string | null;
  clientPF?: {
    id: RegularizeId;
    name: string;
    cpf: string;
    date_of_birth: string | null;
  } | null;
};

export type CreateRegularizePartnerPayload = {
  pj_id: RegularizeId;
  pf_id: RegularizeId;
  part: number;
  entry: string;
  exit?: string;
};

export type UpdateRegularizePartnerPayload = CreateRegularizePartnerPayload & {
  id: RegularizeId;
};

export type RegularizeMunicipalTaxesClientSummary = {
  id: RegularizeId;
  dominio_code?: string | null;
  name: string;
  cpf_cnpj?: string | null;
  city?: string | null;
  municipalTaxes?: Array<{ id: RegularizeId }> | null;
};

export type RegularizeMunicipalTaxesPage = {
  data: RegularizeMunicipalTaxesClientSummary[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
};

export type RegularizeMunicipalTaxesDetail = {
  id: RegularizeId;
  client_id: RegularizeId;
  year: number;
  tff_is_applicable?: boolean | null;
  tff_amount?: number | string | null;
  tff_notes?: string | null;
  tff_analysis_is_done?: boolean | null;
  tff_analysis_notes?: string | null;
  tff_sent_date?: string | null;
  tff_due_date?: string | null;
  tlp_is_applicable?: boolean | null;
  tlp_amount?: number | string | null;
  tlp_notes?: string | null;
  tlp_is_sent?: boolean | null;
  tlp_sent_date?: string | null;
  tlp_due_date?: string | null;
  tlp_not_email?: boolean | null;
  tll_is_applicable?: boolean | null;
  tll_amount?: number | string | null;
  tll_notes?: string | null;
  tll_is_sent?: boolean | null;
  tll_sent_date?: string | null;
  tll_due_date?: string | null;
  tll_analysis_is_done?: boolean | null;
  tll_analysis_notes?: string | null;
};

export type CreateRegularizeMunicipalTaxPayload = {
  client_id: RegularizeId;
  year: number;
  tff_is_applicable: boolean;
  tff_amount: number;
  tff_notes?: string | null;
  tff_analysis_is_done: boolean;
  tff_analysis_notes?: string | null;
  tff_sent_date?: RegularizeOptionalDate;
  tff_due_date?: RegularizeOptionalDate;
  tlp_is_applicable: boolean;
  tlp_amount: number;
  tlp_notes?: string | null;
  tlp_is_sent: string;
  tlp_sent_date?: RegularizeOptionalDate;
  tlp_due_date?: RegularizeOptionalDate;
  tlp_not_email: boolean;
  tll_is_applicable: boolean;
  tll_amount: number;
  tll_notes?: string | null;
  tll_is_sent: string;
  tll_sent_date?: RegularizeOptionalDate;
  tll_due_date?: RegularizeOptionalDate;
  tll_analysis_is_done: boolean;
  tll_analysis_notes?: string | null;
};

export type UpdateRegularizeMunicipalTaxPayload = CreateRegularizeMunicipalTaxPayload & {
  id: RegularizeId;
};

export type RegularizeProcessClientSummary = {
  name?: string | null;
  cpf?: string | null;
  cpf_cnpj?: string | null;
};

export type RegularizeProcessListItem = {
  id: RegularizeId;
  client_pj_id?: RegularizeId | null;
  client_pf_id?: RegularizeId | null;
  cpf_cnpj?: string | null;
  process_type: string;
  status: string;
  financial_status?: RegularizeFinancialStatus | null;
  client_notice_date?: string | null;
  clientPF?: RegularizeProcessClientSummary | null;
  clientPJ?: RegularizeProcessClientSummary | null;
};

export type RegularizeProcessResponsible = {
  id: RegularizeId;
  name: string;
};

export type RegularizeProcessHistoryItem = {
  id: RegularizeId;
  action: string;
  referring: string;
  referring_id: RegularizeId;
  changes: unknown;
  date: string;
  user?: RegularizeProcessResponsible | null;
};

export type RegularizeProcessDetail = RegularizeProcessListItem & {
  description?: string | null;
  entry_date?: string | null;
  completion_date?: string | null;
  expected_date?: string | null;
  observation?: string | null;
  responsible1_id?: RegularizeId | null;
  responsible2_id?: RegularizeId | null;
  responsible3_id?: RegularizeId | null;
  locking_type?: string | null;
  urgency?: string | null;
  task_id?: RegularizeId | null;
  responsible1?: RegularizeProcessResponsible | null;
  responsible2?: RegularizeProcessResponsible | null;
  responsible3?: RegularizeProcessResponsible | null;
  elapsed_days?: number | null;
  history?: RegularizeProcessHistoryItem[];
};

export type CreateRegularizeProcessPayload = {
  client_pj_id?: RegularizeId;
  client_pf_id?: RegularizeId;
  cpf_cnpj: string;
  process_type: string;
  description: string;
  entry_date?: RegularizeOptionalDate;
  completion_date?: RegularizeOptionalDate;
  expected_date?: RegularizeOptionalDate;
  client_notice_date?: RegularizeOptionalDate | null;
  status: string;
  financial_status?: RegularizeFinancialStatus;
  observation?: string | null;
  responsible1_id?: RegularizeId;
  responsible2_id?: RegularizeId;
  responsible3_id?: RegularizeId;
  locking_type?: string | null;
  urgency?: string | null;
  task_id?: RegularizeId;
};

export type UpdateRegularizeProcessPayload = CreateRegularizeProcessPayload & {
  id: RegularizeId;
};

export type RegularizeProcessActionPayload = {
  id: RegularizeId;
};

export type RegularizeProcessActionResult = {
  process: RegularizeProcessDetail;
  action: "Envio ao Fiscal" | "Retorno do Fiscal";
};

export type RegularizeGuidanceEconomicActivity = {
  id?: RegularizeId;
  code?: string | null;
  description?: string | null;
  type?: string | null;
  [key: string]: unknown;
};

export type RegularizeGuidancePartner = {
  id?: RegularizeId;
  name?: string | null;
  cpf?: string | null;
  document?: string | null;
  percentage?: number | string | null;
  role?: string | null;
  profession?: string | null;
  marital_status?: string | null;
  rg?: string | null;
  cnh?: string | null;
  address?: string | null;
  share?: number | string | null;
  [key: string]: unknown;
};

export type RegularizeGuidanceChecklistInput = {
  code: RegularizeGuidanceChecklistCode;
  status: RegularizeGuidanceChecklistStatus;
  observation?: string;
};

export type RegularizeGuidanceChecklistItem = {
  id: RegularizeId;
  guidance_id: RegularizeId;
  code: RegularizeGuidanceChecklistCode;
  label: string;
  status: RegularizeGuidanceChecklistStatus;
  observation: string | null;
  created_at: string;
  updated_at: string;
};

export type RegularizeGuidance = {
  id: RegularizeId;
  process_id: RegularizeId | null;
  target_type: RegularizeGuidanceTargetType;
  client_pj_id?: RegularizeId | null;
  client_pf_id?: RegularizeId | null;
  target_snapshot: RegularizeGuidanceSnapshot;
  branch_data: RegularizeGuidanceBranchData | null;
  checklist_items: RegularizeGuidanceChecklistItem[];
  description?: string | null;
  type?: string | null;
  request?: string | null;
  framework_obs?: string | null;
  legal_nature?: string | null;
  company_name?: string | null;
  trade_name?: string | null;
  cpf_cnpj?: string | null;
  share_capital?: number | string | null;
  iptu?: string | null;
  address?: string | null;
  comporate_purpose?: string | null;
  carryng?: string | null;
  regime?: string | null;
  legal_representative?: string | null;
  status?: string | null;
  economic_activities?: RegularizeGuidanceEconomicActivity[] | null;
  partners?: RegularizeGuidancePartner[] | null;
  [key: string]: unknown;
};

export type RegularizeGuidanceEconomicActivityPayload = {
  id?: RegularizeId;
  code: string;
  description: string;
  type: string;
};

export type RegularizeGuidancePartnerPayload = {
  id?: RegularizeId;
  name: string;
  cpf: string;
  percentage?: number;
  role?: string;
  profession?: string;
  marital_status?: string;
  rg?: string;
  cnh?: string;
  address?: string;
  share?: number;
};

export type RegularizeGuidanceManualSnapshot = {
  version: 1;
  source: "manual";
  name: string;
  document?: string;
  address?: string;
  city?: string;
  state?: string;
  type?: string;
  request?: string;
  framework_obs?: string;
  legal_nature?: string;
  company_name?: string;
  trade_name?: string;
  cpf_cnpj?: string;
  share_capital?: number | string;
  iptu?: string;
  comporate_purpose?: string;
  carryng?: string;
  regime?: string;
  legal_representative?: string;
  economic_activities?: RegularizeGuidanceEconomicActivityPayload[];
  partners?: RegularizeGuidancePartnerPayload[];
  status?: string;
};

type RegularizeGuidancePayloadFields = {
  type?: string;
  request?: string;
  framework_obs?: string;
  legal_nature?: string;
  company_name?: string;
  trade_name?: string;
  cpf_cnpj?: string;
  share_capital?: number;
  iptu?: string;
  address?: string;
  comporate_purpose?: string;
  carryng?: string;
  regime?: string;
  legal_representative?: string;
  status?: string;
};

type RegularizeGuidanceCreatePayloadFields = RegularizeGuidancePayloadFields & {
  economic_activities?: RegularizeGuidanceEconomicActivityPayload[];
  partners?: RegularizeGuidancePartnerPayload[];
};

type RegularizeGuidanceCompletePayload = RegularizeGuidanceCreatePayloadFields & {
  process_id?: RegularizeId | null;
  target_type: RegularizeGuidanceTargetType;
  client_pj_id?: RegularizeId | null;
  client_pf_id?: RegularizeId | null;
  target_snapshot?: RegularizeGuidanceManualSnapshot;
  branch_data?: RegularizeGuidanceBranchData;
  checklist: RegularizeGuidanceChecklistInput[];
  status: string;
};

export type LegacyGuidanceDraft = RegularizeGuidanceCreatePayloadFields & {
  process_id: RegularizeId;
  status: string;
};

export type CreateRegularizeGuidancePayload =
  | RegularizeGuidanceCompletePayload
  | LegacyGuidanceDraft;

export type UpdateRegularizeGuidancePayload = RegularizeGuidancePayloadFields & {
  id: RegularizeId;
  process_id?: RegularizeId | null;
  target_type?: RegularizeGuidanceTargetType;
  client_pj_id?: RegularizeId | null;
  client_pf_id?: RegularizeId | null;
  target_snapshot?: RegularizeGuidanceManualSnapshot;
  checklist?: RegularizeGuidanceChecklistInput[];
  branch_data?: RegularizeGuidanceBranchData;
};

export type AddRegularizeGuidanceActivityPayload = {
  guidance_id: RegularizeId;
  process_id?: RegularizeId;
  activity: RegularizeGuidanceEconomicActivityPayload;
};

export type UpdateRegularizeGuidanceActivityPayload = {
  guidance_id: RegularizeId;
  process_id?: RegularizeId;
  activity: RegularizeGuidanceEconomicActivityPayload & { id: RegularizeId };
};

export type RemoveRegularizeGuidanceActivityPayload = {
  guidance_id: RegularizeId;
  process_id?: RegularizeId;
  item_id: RegularizeId;
};

export type AddRegularizeGuidancePartnerPayload = {
  guidance_id: RegularizeId;
  process_id?: RegularizeId;
  partner: RegularizeGuidancePartnerPayload;
};

export type UpdateRegularizeGuidancePartnerPayload = {
  guidance_id: RegularizeId;
  process_id?: RegularizeId;
  partner: RegularizeGuidancePartnerPayload & { id: RegularizeId };
};

export type RemoveRegularizeGuidancePartnerPayload = RemoveRegularizeGuidanceActivityPayload;

export type RegularizeLicenseListItem = {
  id: RegularizeId;
  client_id?: RegularizeId | null;
  client_name?: string | null;
  has?: boolean | null;
  type_license: string;
  entry_date?: string | null;
  protocol?: string | null;
  responsible_id?: RegularizeId | null;
  status: string;
  date_last_consultation?: string | null;
  current_situation?: string | null;
  contact?: string | null;
  observation?: string | null;
  urgency?: string | null;
  type?: string | null;
  due_date?: string | null;
  task_id?: RegularizeId | null;
  protocol_file?: RegularizeLicenseProtocolMetadata | null;
};

export type RegularizeLicenseProtocolMetadata = {
  original_name: string;
  mime_type: "application/pdf" | "image/jpeg" | "image/png" | "image/webp";
  size_bytes: number;
  uploaded_at: string;
};

export type RegularizeLicenseProtocolAccess = {
  url: string;
  expires_in_seconds: number;
};

export type RegularizeLicenseDetail = RegularizeLicenseListItem & {
  client?: { name?: string | null } | null;
  responsible?: { name?: string | null } | null;
};

export type CreateRegularizeLicensePayload = {
  client_id?: RegularizeId;
  has: boolean;
  type_license: string;
  entry_date: string;
  protocol: string;
  responsible_id?: RegularizeId;
  status: string;
  date_last_consultation?: RegularizeOptionalDate;
  current_situation: string;
  contact: string;
  observation?: string | null;
  urgency: string;
  type: string;
  due_date?: RegularizeOptionalDate;
  task_id?: RegularizeId;
};

export type UpdateRegularizeLicensePayload = CreateRegularizeLicensePayload & {
  id: RegularizeId;
};

export interface RegularizeDashboard {
  year: number;
  metrics: {
    openProcesses: number;
    activeLicenses: number;
    activeClientPfs: number;
    activeSites: number;
    municipalTaxesCompleted: number;
    municipalTaxesPending: number;
    municipalTaxesTotal: number;
  };
  recentProcesses: RegularizeProcessListItem[];
  trackedLicenses: Array<
    Pick<RegularizeLicenseListItem, "id" | "type_license" | "protocol" | "due_date">
  >;
}

export type RegularizeDteImportFormat = "html" | "json";

export type RegularizeDteImportPayload = {
  format: RegularizeDteImportFormat;
  content: string;
};

export type RegularizeDteRejectionReason =
  | "LINHA_INCOMPLETA"
  | "ITEM_INVALIDO"
  | "CAMPO_INVALIDO"
  | "CAMPO_LONGO"
  | "SEM_DADOS";

export type RegularizeDteImport = {
  id: RegularizeId;
  format: RegularizeDteImportFormat;
  total_rows: number;
  created_count: number;
  duplicate_count: number;
  rejected_count: number;
  duplicates: Array<{ row: number; aviso: string; cnpj_cpf: string }>;
  rejections: Array<{ row: number; reason: RegularizeDteRejectionReason }>;
  created_at: string;
};

export const REGULARIZE_DTE_NOTICE_READING_FILTERS = ["Todos", "Pendente", "Lido"] as const;
export type RegularizeDteNoticeReadingFilter =
  (typeof REGULARIZE_DTE_NOTICE_READING_FILTERS)[number];

// Datas no formato do <input type="date"> (aaaa-mm-dd); vazio = sem limite.
export type RegularizeDteNoticeListFilters = {
  from: string;
  to: string;
  tipo: string;
  search: string;
  reading: RegularizeDteNoticeReadingFilter;
  page: number;
  limit: number;
};

export type RegularizeDteNotice = {
  id: RegularizeId;
  tipo: string;
  aviso: string;
  cnpj_cpf: string;
  destinatario: string;
  remetente: string;
  data_emissao: string | null;
  assunto: string;
  data_leitura: string | null;
  data_ciencia: string | null;
  // Data da consulta na SEFAZ, quando a colagem trouxe.
  registro: string | null;
  pending_reading: boolean;
  created_at: string;
};

export type RegularizeDteNoticesPage = {
  data: RegularizeDteNotice[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
};

export type RegularizeDteNoticeReadingPayload = {
  id: RegularizeId;
  pending_reading: boolean;
};

export const REGULARIZE_DTE_QUERY_STATUSES = ["feita", "nao_feita", "sem_registro"] as const;
export type RegularizeDteQueryStatus = (typeof REGULARIZE_DTE_QUERY_STATUSES)[number];

export type RegularizeDteQueryGridRow = {
  client_id: RegularizeId;
  name: string;
  fantasy_name: string | null;
  cpf_cnpj: string | null;
  status: RegularizeDteQueryStatus;
};

export type RegularizeDteQueryGrid = {
  date: string;
  rows: RegularizeDteQueryGridRow[];
  totals: Record<RegularizeDteQueryStatus, number>;
};

// date no formato do <input type="date"> (aaaa-mm-dd).
export type RegularizeDteQueryStatusPayload = {
  client_id: RegularizeId;
  date: string;
  status: RegularizeDteQueryStatus;
};

export type RegularizeDteQueryListsPayload = {
  date: string;
  done: string;
  not_done: string;
};

export type RegularizeDteQueryListsResult = {
  date: string;
  done_count: number;
  not_done_count: number;
  conflicts: string[];
  unknown: string[];
};

export type RegularizeDteImportsPage = {
  data: RegularizeDteImport[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
};
