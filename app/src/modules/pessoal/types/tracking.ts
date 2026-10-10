export interface PessoalLdd {
  id: string;
  client_id: string;
  type: string;
  period: string | null;
  due_date: string | null;
  balance_amount: number | null;
  registration_status: string | null;
  status: string | null;
  organization_id?: string;
}

export interface PessoalLddPayload {
  client_id: string;
  type: string;
  period: string | null;
  due_date: string | null;
  balance_amount: number | null;
  registration_status: string | null;
  status: string | null;
}

export type PessoalLddUpdatePayload = Partial<Omit<PessoalLddPayload, "client_id">>;

export interface PessoalLddListParams {
  client_id?: string;
}

export interface PessoalLddImportPreviewPayload {
  client_id: string;
  file_name: string;
  content_base64: string;
}

export interface PessoalLddImportPreviewRow {
  line: number;
  source: string;
  period: string | null;
  due_date: string | null;
  balance_amount: number | null;
  errors: string[];
}

export interface PessoalLddImportPreview {
  file_name: string;
  /** SHA-256 do PDF; volta na confirmação para o servidor barrar o reenvio. */
  file_hash: string;
  already_imported_at: string | null;
  rows: PessoalLddImportPreviewRow[];
}

export interface PessoalLddImportRow {
  period: string;
  due_date: string;
  balance_amount: number;
}

export interface PessoalLddImportPayload {
  client_id: string;
  file_name: string;
  file_hash: string;
  rows: PessoalLddImportRow[];
}

export interface PessoalLddImportResult {
  import_id: string;
  rows_count: number;
  total_amount: number;
  records: (PessoalLddImportRow & { id: string })[];
}

export type PessoalSituationStatus = "Em andamento" | "Finalizado";

export interface PessoalSituation {
  id: string;
  client_id: string;
  title: string;
  description: string;
  status: PessoalSituationStatus;
  registration_date: string;
  completion_date: string | null;
  registered_by_id: string;
  completed_by_id: string | null;
  organization_id?: string;
}

export interface PessoalSituationPayload {
  client_id: string;
  title: string;
  description: string;
  status?: PessoalSituationStatus;
}

export type PessoalSituationUpdatePayload = Partial<
  Pick<PessoalSituation, "title" | "description" | "status">
>;
