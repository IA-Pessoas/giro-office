export type CertificateKind = "pj" | "pf";

export interface CertificatePaginationParams {
  page?: number;
  page_size?: number;
}

export interface CertificateListPage<T> {
  data: T[];
  page: number;
  page_size: number;
  hasMore: boolean;
}

export interface CertificatePjListParams extends CertificatePaginationParams {
  name?: string;
  cnpj?: string;
  responsible?: string;
  model?: string;
  client_castelo_status?: boolean;
  client_focus_status?: boolean;
  was_paid?: boolean;
  has_certificate?: boolean;
}

export interface CertificatePfListParams extends CertificatePaginationParams {
  search?: string;
  name?: string;
  cpf?: string;
  enterprise?: string;
  cnpj?: string;
  model?: string;
  client_castelo_status?: boolean;
  client_focus_status?: boolean;
  was_paid?: boolean;
  has_certificate?: boolean;
}

export interface CertificatePj {
  id: string;
  client_castelo_status: boolean;
  client_focus_status: boolean;
  name: string;
  cnpj: string;
  responsible: string;
  model: string;
  legal_nature: string;
  password?: string | null;
  expiration_date: string;
  notes: string | null;
  was_paid: boolean;
  payment_date: string | null;
  payment_amount: number | null;
  contact_info: string | null;
  has_certificate: boolean;
  organization_id: string;
}

export interface CertificatePf {
  id: string;
  client_castelo_status: boolean;
  client_focus_status: boolean;
  name: string;
  cpf: string;
  model: string;
  password?: string | null;
  expiration_date: string;
  notes: string | null;
  enterprise: string | null;
  cnpj: string | null;
  was_paid: boolean;
  payment_date: string | null;
  payment_amount: number | null;
  contact_info: string | null;
  has_certificate: boolean;
  organization_id: string;
}

export interface CreateCertificatePjBody {
  client_castelo_status: boolean;
  client_focus_status: boolean;
  name: string;
  cnpj: string;
  responsible: string;
  model: string;
  legal_nature: string;
  password: string;
  expiration_date: string;
  notes?: string | null;
  was_paid: boolean;
  payment_date?: string | null;
  payment_amount?: number | null;
  contact_info?: string | null;
}

export type UpdateCertificatePjBody = Partial<CreateCertificatePjBody>;

export interface CreateCertificatePfBody {
  client_castelo_status: boolean;
  client_focus_status: boolean;
  name: string;
  cpf: string;
  model: string;
  password: string;
  expiration_date: string;
  notes?: string | null;
  enterprise?: string | null;
  cnpj?: string | null;
  was_paid: boolean;
  payment_date?: string | null;
  payment_amount?: number | null;
  contact_info?: string | null;
}

export type UpdateCertificatePfBody = Partial<CreateCertificatePfBody>;

export interface CertificateFileMetadata {
  file_original_name: string;
  file_mime_type: string;
  file_size_bytes: number;
  file_uploaded_at: string;
  file_uploaded_by_user_id: string;
  has_certificate: true;
}

export interface CertificateDownloadResult {
  blob: Blob;
  filename: string;
  mimeType: string;
}

export interface CertificateNotificationListParams extends CertificatePaginationParams {}

export interface CertificateNotification {
  id: string;
  certificate_id: string;
  client_name: string;
  type: "PJ" | "PF";
  date: string;
  organization_id: string;
}

