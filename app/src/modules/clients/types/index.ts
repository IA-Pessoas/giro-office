export interface Client {
  id: string;
  dominio_code: string;
  name: string;
  company_name: string;
  fantasy_name: string;
  cnpj: string;
  cnae: string;
  cnae_secondary: string;
  responsible: string;
  cpf_responsible: string;
  agent: string;
  cpf_agent: string;
  number: string;
  email: string;
  address: string;
  cep: string;
  neighborhood: string;
  state: string;
  city: string;
  customer_since: Date | null;
  municipal_registration: string;
  state_registration: string;
  commercial_board_registration: string;
  status: string;
  competence_entry: string | null;
  competence_output: string | null;
  opening_date: Date | null;
  instagram: string;
  indication: string;
  regime: string | null;
  size: string;
  segment: string;
  contabil: boolean;
  fiscal: boolean;
  pessoal: boolean;
  infoproduto: boolean;
  consultoria: boolean;
  castelo_med: boolean;
  start_strike: Date | null;
  end_strike: Date | null;
  deletion_date: Date | null;
  contract: boolean;
  service: string;
  solucao: string;
  prospecting_status: string;
  date_status: Date | null;
  closing_date: Date | null;
  description_prospecting: string;
  month_prospecting: Date | null;
  register_date_prospecting: Date | null;
  participants_meet: string;
  meet_type: string;
  service_unique: boolean;
  type: 'PJ' | 'PF';
  type_registration: string;
  cpf_cnpj: string;
}

export type ClientStatus = "Ativo" | "Inativo" | "Prospect" | "Prospecção" | "Fechado" | string;
export type ClientTaxRegime = "Simples Nacional" | "Lucro Presumido" | "Lucro Real";

export interface ClientItem {
  id: string;
  dominio_code?: string;
  name: string;
  company_name: string;
  fantasy_name: string;
  cpf_cnpj: string;
  status: string;
}

export interface ClientOrganizationSummary {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  status: string;
  subscription_plan: string;
}

export interface ClientRecord {
  id: string;
  name: string;
  organization_id: string;
  status: ClientStatus;
  cpf_cnpj: string;
  company_name: string | null;
  fantasy_name: string | null;
  service_unique: boolean;
  deletion_date: string | null;
  organization?: ClientOrganizationSummary;
}

export interface ClientListPage {
  items: ClientRecord[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface ClientInstagramProfile {
  id: string;
  name: string;
  status: ClientStatus;
  instagram: string | null;
}

export interface ClientInstagramProfilePage {
  items: ClientInstagramProfile[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface ClientInstagramProfileFilters {
  profile: "all" | "with" | "without";
  page: number;
  limit: number;
  search?: string;
}

export interface ClientCompanyLookup {
  cnpj: string;
  name: string | null;
  company_name: string | null;
  fantasy_name: string | null;
  opening_date: string | null;
  address: string | null;
  cep: string | null;
  neighborhood: string | null;
  state: string | null;
  city: string | null;
}

export interface ClientListFilters {
  search?: string;
  ref?: "integracao" | "deps";
  status?: string;
  page?: number;
  limit?: number;
  legacyIntegrationStatusFilter?: boolean;
}

export interface ClientFormValues {
  type?: "PJ" | "PF";
  name: string;
  company_name: string;
  fantasy_name: string;
  cpf_cnpj: string;
  status: string;
  regime: ClientTaxRegime | "";
  service_unique: boolean;
}

export interface ClientIntegrationFormValuesBase {
  type: "PJ" | "PF";
  regime: ClientTaxRegime | "";
  name: string;
  cpf_cnpj: string;
  company_name: string;
  fantasy_name: string;
  responsible: string;
  cpf_responsible: string;
  number: string;
  email: string;
  agent: string;
  cpf_agent: string;
  instagram: string;
  indication: string;
  type_registration: string;
  service_unique: boolean;
}

export interface CreateClientIntegrationFormValues extends ClientIntegrationFormValuesBase {
  opening_date: string;
  participants_meet: string;
  meet_type: string;
}

export interface UpdateClientIntegrationFormValues extends ClientIntegrationFormValuesBase {
  address: string;
  cep: string;
  neighborhood: string;
  state: string;
  city: string;
}

export interface ClientPaRelatedClient {
  company_name: string | null;
  cpf_cnpj: string | null;
  responsible: string | null;
  opening_date: string | null;
  number: string | null;
  register_date_prospecting: string | null;
  participants_meet: string | null;
  email: string | null;
  meet_type: string | null;
  indication: string | null;
  instagram: string | null;
  regime: string | null;
  cnae: string | null;
  cnae_secondary: string | null;
  contabil: boolean | null;
  fiscal: boolean | null;
  pessoal: boolean | null;
  infoproduto: boolean | null;
  consultoria: boolean | null;
  castelo_med: boolean | null;
}

export interface ClientPa {
  client_id: string;
  activities: string | null;
  tax_billing: string | null;
  management_billing: string | null;
  works_bidding: boolean | null;
  dissatisfaction: string | null;
  registered_collabortors: number | null;
  unregistered_collabortors: number | null;
  esocial: boolean | null;
  how_many_banks: boolean | null;
  whitch_banks: string | null;
  responsible_departments: string | null;
  works_system: boolean | null;
  system_name: string | null;
  system_usage_time: string | null;
  system_value: string | null;
  system_contact: string | null;
  system_operations: string | null;
  cloud_storage: boolean | null;
  which_cloud_storage: string | null;
  rental_agreement: boolean | null;
  assessment_regime: string | null;
  permit: string | null;
  services: string | null;
}

export interface ClientPaResponse extends ClientPa {
  client: ClientPaRelatedClient;
}

export interface UpdateClientPaPayload {
  activities?: string | null;
  tax_billing?: string | null;
  management_billing?: string | null;
  works_bidding?: boolean | null;
  dissatisfaction?: string | null;
  registered_collabortors?: number | null;
  unregistered_collabortors?: number | null;
  esocial?: boolean | null;
  how_many_banks?: boolean | null;
  whitch_banks?: string | null;
  responsible_departments?: string | null;
  works_system?: boolean | null;
  system_name?: string | null;
  system_usage_time?: string | null;
  system_value?: string | null;
  system_contact?: string | null;
  system_operations?: string | null;
  cloud_storage?: boolean | null;
  which_cloud_storage?: string | null;
  rental_agreement?: boolean | null;
  assessment_regime?: string | null;
  permit?: string | null;
  services?: string | null;
}

export interface Perms {
  id: string;
  user_id: string;
  certificado: number;
  comercial: number;
  contabil: number;
  financeiro: number;
  fiscal: number;
  integracao: number;
  marketing: number;
  parcelamento: number;
  pessoal: number;
  regularize: number;
  rh: number;
  triagem: number;
}

export interface CreateClientData {
  name: string;
  company_name: string;
  fantasy_name: string;
  cpf_cnpj: string;
  type: 'PJ' | 'PF';
  [key: string]: any;
}

export interface CreateClientPayload {
  organization_id?: string;
  type: "PJ" | "PF";
  name: string;
  status?: string;
  cpf_cnpj: string;
  company_name?: string | null;
  fantasy_name?: string | null;
  regime?: ClientTaxRegime | null;
  service_unique?: boolean;
}

export interface CreateClientIntegrationPayload {
  organization_id: string;
  type: "PJ" | "PF";
  regime?: ClientTaxRegime | null;
  name: string;
  cpf_cnpj: string;
  company_name?: string | null;
  fantasy_name?: string | null;
  opening_date?: string | null;
  responsible?: string | null;
  cpf_responsible?: string | null;
  number?: string | null;
  email?: string | null;
  agent?: string | null;
  cpf_agent?: string | null;
  instagram?: string | null;
  indication?: string | null;
  participants_meet?: string | null;
  meet_type?: string | null;
  type_registration?: string | null;
  service_unique?: boolean;
}

export interface UpdateClientData {
  [key: string]: any;
}

export interface UpdateClientPayload {
  name?: string;
  status?: string;
  cpf_cnpj?: string;
  company_name?: string | null;
  fantasy_name?: string | null;
  regime?: ClientTaxRegime | null;
  service_unique?: boolean;
}

export interface UpdateClientIntegrationPayload {
  type?: "PJ" | "PF";
  regime?: ClientTaxRegime | null;
  name?: string;
  cpf_cnpj?: string;
  company_name?: string | null;
  fantasy_name?: string | null;
  responsible?: string | null;
  cpf_responsible?: string | null;
  number?: string | null;
  email?: string | null;
  agent?: string | null;
  cpf_agent?: string | null;
  instagram?: string | null;
  indication?: string | null;
  type_registration?: string | null;
  service_unique?: boolean;
  address?: string | null;
  cep?: string | null;
  neighborhood?: string | null;
  state?: string | null;
  city?: string | null;
}

export interface UpdateClientFinancePayload {
  contract?: boolean;
}

export interface UpdateClientRegularizePayload {
  dominio_code?: string | null;
  name?: string;
  company_name?: string | null;
  fantasy_name?: string | null;
  cpf_cnpj?: string;
  cnae?: string | null;
  cnae_secondary?: string | null;
  responsible?: string | null;
  cpf_responsible?: string | null;
  number?: string | null;
  email?: string | null;
  address?: string | null;
  cep?: string | null;
  neighborhood?: string | null;
  state?: string | null;
  city?: string | null;
  customer_since?: string | null;
  municipal_registration?: string | null;
  state_registration?: string | null;
  commercial_board_registration?: string | null;
  opening_date?: string | null;
  regime?: string | null;
  size?: string | null;
  segment?: string | null;
  contabil?: boolean;
  fiscal?: boolean;
  pessoal?: boolean;
  infoproduto?: boolean;
  consultoria?: boolean;
  start_strike?: string | null;
  end_strike?: string | null;
  deletion_date?: string | null;
}

export interface TerminateClientPayload {
  reason: string;
  description: string;
  competence_output: string;
}

export interface ClientFinanceFormValues {
  contract: boolean;
}

export interface ClientRegularizeFormValues {
  type: "PJ" | "PF";
  dominio_code: string;
  name: string;
  company_name: string;
  fantasy_name: string;
  cpf_cnpj: string;
  cnae: string;
  cnae_secondary: string;
  responsible: string;
  cpf_responsible: string;
  number: string;
  email: string;
  address: string;
  cep: string;
  neighborhood: string;
  state: string;
  city: string;
  customer_since: string;
  municipal_registration: string;
  state_registration: string;
  commercial_board_registration: string;
  opening_date: string;
  regime: string;
  size: string;
  segment: string;
  contabil: boolean;
  fiscal: boolean;
  pessoal: boolean;
  infoproduto: boolean;
  consultoria: boolean;
  start_strike: string;
  end_strike: string;
  deletion_date: string;
}

export interface ClientTerminationFormValues {
  reason: string;
  description: string;
  competence_output: string;
}

export interface ClientFinanceRecord {
  id: string;
  contract: boolean | null;
}

export interface ClientTerminationRecord {
  id: string;
  client_id: string;
  reason: string;
  description: string;
  competence: string;
  user_id: string;
}

export interface ClientHistoryUserDepartment {
  name: string;
}

export interface ClientHistoryUser {
  name: string;
  department?: ClientHistoryUserDepartment | null;
}

export interface ClientHistoryItem {
  id: string;
  client_id: string;
  date: string;
  history: string;
  file: string | null;
  user_id: string;
  user?: ClientHistoryUser;
}

export interface CreateClientHistoryPayload {
  date: string | Date;
  history: string;
  pending_id?: string;
  file?: File | null;
}

export interface UpdateClientHistoryPayload {
  date: string | Date;
  history: string;
}

export interface ClientHistoryPendingClient {
  company_name: string;
  cpf_cnpj: string;
}

export interface ClientHistoryPendingItem {
  id: string;
  reason: string;
  client_id: string;
  client?: ClientHistoryPendingClient;
}

export interface CreateClientHistoryPendingPayload {
  reason: string;
}
