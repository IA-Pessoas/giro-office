export type PessoalTabId =
  | "overview"
  | "unions"
  | "payroll"
  | "obligations"
  | "tracking"
  | "passwords";

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
}

export interface PessoalSuccessEnvelope<T> {
  success: true;
  data: T;
}
