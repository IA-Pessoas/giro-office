export interface PessoalPasswordListItem {
  id: string;
  client_id: string;
  service_name: string;
  responsavel_id: string | null;
  responsavel?: unknown;
}

export interface PessoalPasswordDetail extends PessoalPasswordListItem {
  login_main?: string | null;
  senha_main?: string | null;
  login_secondary?: string | null;
  senha_secondary?: string | null;
  notes?: string | null;
  organization_id?: string;
}

export interface PessoalPasswordPayload {
  client_id: string;
  service_name: string;
  login_main?: string | null;
  senha_main?: string | null;
  login_secondary?: string | null;
  senha_secondary?: string | null;
  responsavel_id?: string | null;
  notes?: string | null;
}

export type PessoalPasswordUpdatePayload = Partial<Omit<PessoalPasswordPayload, "client_id">>;
