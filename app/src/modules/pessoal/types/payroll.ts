export interface PessoalPayroll {
  id: string;
  client_id: string;
  responsible_id: string | null;
  advance: boolean;
  advance_type: string | null;
  advance_amount: number | null;
  info: string;
  previous: boolean;
  onvio: boolean;
  group: string;
  vt: boolean;
  vt_value: number | null;
  vt_type: string | null;
  va: boolean;
  assistance_fee: boolean;
  union_id: string | null;
  bem_mais: boolean;
  bsf: boolean;
  reinf: boolean;
  employees: number;
  contact: string | null;
  organization_id?: string;
}

export interface PessoalPayrollPayload {
  client_id: string;
  responsible_id: string | null;
  advance: boolean;
  advance_type: string | null;
  advance_amount: number | null;
  info: string;
  previous: boolean;
  onvio: boolean;
  group: string;
  vt: boolean;
  vt_value: number | null;
  vt_type: string | null;
  va: boolean;
  assistance_fee: boolean;
  union_id: string | null;
  bem_mais: boolean;
  bsf: boolean;
  reinf: boolean;
  employees: number;
  contact: string | null;
}
