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

export const PESSOAL_OBLIGATION_ITEMS = [
  { name: "advance", label: "Adiantamento" },
  { name: "payroll", label: "Folha" },
  { name: "charges", label: "Encargos" },
  { name: "assistance_fee", label: "Contribuição assistencial" },
  { name: "bem_mais", label: "Bem Mais" },
  { name: "bsf", label: "BSF" },
  { name: "va", label: "Vale-alimentação" },
  { name: "vt", label: "Vale-transporte" },
] as const;

export type PessoalObligationItem = (typeof PESSOAL_OBLIGATION_ITEMS)[number]["name"];

/** pendente = false, concluído = true, não possui = null. */
export type PessoalObligationItemState = "pending" | "done" | "none";

export interface PessoalObligationPortfolioFilters {
  competence: string;
  responsavel_id?: string;
  group_id?: string;
  item?: PessoalObligationItem;
  state?: PessoalObligationItemState;
  page: number;
  page_size: number;
}

export interface PessoalObligationPortfolioItem extends PessoalObligation {
  group_snapshot_id: string | null;
  group_snapshot_name: string | null;
  client: { id: string; name: string };
  responsible: { id: string; name: string } | null;
}

export interface PessoalObligationPortfolioPage {
  items: PessoalObligationPortfolioItem[];
  total: number;
  page: number;
  page_size: number;
}

export interface PessoalObligationHistoryChange {
  field: PessoalObligationItem | "responsavel_id";
  from: boolean | string | null;
  to: boolean | string | null;
}

export interface PessoalObligationHistoryItem {
  id: string;
  at: string;
  actor: { id: string; name: string | null } | null;
  action: string | null;
  changes: PessoalObligationHistoryChange[];
}

export interface PessoalObligationHistoryPage {
  obligation_id: string;
  client_id: string;
  competence: string;
  page: number;
  pageSize: number;
  total: number;
  items: PessoalObligationHistoryItem[];
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
