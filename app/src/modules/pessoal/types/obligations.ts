export interface PessoalObligation {
  id: string;
  client_id: string;
  competence: string;
  advance: boolean | null;
  payroll: boolean | null;
  charges: boolean | null;
  assistance_fee: boolean | null;
  responsavel_id: string | null;
  bem_mais: boolean | null;
  bsf: boolean | null;
  va: boolean | null;
  vt: boolean | null;
}

export interface PessoalObligationCreatePayload {
  client_id: string;
  competence: string;
}

export interface PessoalObligationCreateResult {
  created: boolean;
  obligation: PessoalObligation;
}

export interface PessoalObligationGenerationResult {
  clients: number;
  payrollRows: number;
  existing: number;
  created: number;
  skippedExisting: number;
  skippedNoPayroll: number;
}

export type PessoalObligationUpdatePayload = Partial<
  Pick<
    PessoalObligation,
    | "advance"
    | "payroll"
    | "charges"
    | "assistance_fee"
    | "responsavel_id"
    | "bem_mais"
    | "bsf"
    | "va"
    | "vt"
  >
>;
