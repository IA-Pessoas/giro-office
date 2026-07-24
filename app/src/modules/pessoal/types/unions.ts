export interface PessoalUnion {
  id: string;
  name: string;
  cnpj: string;
  base_date: string | null;
}

export interface PessoalUnionPayload {
  name: string;
  cnpj: string;
  base_date?: string | null;
}

export interface PessoalUnionListParams {
  search?: string;
  page: number;
  limit: number;
}
