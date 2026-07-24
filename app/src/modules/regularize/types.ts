export type RegularizeId = string;

export type RegularizeStatus = string | boolean;

export type RegularizePartnerType = "pf" | "pj";

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
};

export type RegularizePartnerListFilters = {
  type: RegularizePartnerType;
  client_id: RegularizeId;
};

export type RegularizeMunicipalTaxesListFilters = {
  year: number;
};

export type RegularizeProcessListFilters = {
  status: string;
  search?: string;
  page?: number;
  limit?: number;
};

export type RegularizeGuidanceListFilters = {
  process_id: RegularizeId;
};

export type RegularizeLicenseListFilters = {
  status: string;
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

export type RegularizePartner = {
  id: RegularizeId;
  pj_id: RegularizeId;
  pf_id: RegularizeId;
  part?: number | string | null;
  entry?: string | null;
  exit?: string | null;
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
  clientPF?: RegularizeProcessClientSummary | null;
  clientPJ?: RegularizeProcessClientSummary | null;
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
  status: string;
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
  role?: string | null;
  share?: number | string | null;
  [key: string]: unknown;
};

export type RegularizeGuidance = {
  id: RegularizeId;
  process_id: RegularizeId;
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
  code: string;
  description: string;
  type: string;
};

export type RegularizeGuidancePartnerPayload = {
  name: string;
  cpf: string;
  role?: string;
  share?: number;
};

export type CreateRegularizeGuidancePayload = {
  process_id: RegularizeId;
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
  status: string;
  economic_activities?: RegularizeGuidanceEconomicActivityPayload[];
  partners?: RegularizeGuidancePartnerPayload[];
};

export type UpdateRegularizeGuidancePayload = Partial<
  Omit<CreateRegularizeGuidancePayload, "process_id" | "economic_activities" | "partners">
> & {
  id: RegularizeId;
  process_id?: RegularizeId;
};

export type AddRegularizeGuidanceActivityPayload = {
  guidance_id: RegularizeId;
  process_id?: RegularizeId;
  activity: RegularizeGuidanceEconomicActivityPayload;
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

export type RemoveRegularizeGuidancePartnerPayload = RemoveRegularizeGuidanceActivityPayload;

export type RegularizeLicenseListItem = {
  id: RegularizeId;
  client_id?: RegularizeId | null;
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
