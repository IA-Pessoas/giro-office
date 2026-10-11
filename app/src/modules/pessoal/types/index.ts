export type PessoalTabId =
  | "overview"
  | "groups"
  | "groupAssignments"
  | "unions"
  | "payroll"
  | "obligations"
  | "tracking"
  | "passwords"
  | "agenda";

export interface PessoalTab {
  id: PessoalTabId;
  label: string;
}

export interface PessoalClientOption {
  id: string;
  name: string;
  document?: string | null;
}

export interface PessoalOverviewSummary {
  unions: {
    total: number;
    withBaseDate: number;
    withoutBaseDate: number;
    withCnpj: number;
  };
  ldd: {
    total: number;
    open: number;
    overdue: number;
    paid: number;
  };
  payroll?: { total: number };
  obligations?: { competence: string; total: number };
}

export interface PessoalSuccessEnvelope<T> {
  success: true;
  data: T;
}

export * from "./groupAssignments";
