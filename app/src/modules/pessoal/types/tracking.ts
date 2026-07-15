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
