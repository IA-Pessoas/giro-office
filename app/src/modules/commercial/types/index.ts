export type CommercialLeadStatus =
  | "new"
  | "contacted"
  | "qualified"
  | "proposal"
  | "negotiation"
  | "won"
  | "lost"
  | "paused";

export type CommercialPriority = "low" | "medium" | "high" | "urgent";

export interface CommercialLead {
  id: string;
  name: string;
  company: string;
  cnpj: string;
  email: string | null;
  phone: string | null;
  source: string;
  status: CommercialLeadStatus;
  value: number;
  priority: CommercialPriority;
  assignee: string;
  createdDate: string;
  lastContact: string | null;
  nextFollowUp: string | null;
  notes: string | null;
}

export interface CommercialProposal {
  id: string;
  lead: string;
  company: string;
  services: string[];
  monthlyValue: number;
  setupFee: number;
  validUntil: string;
  status: "draft" | "sent" | "viewed" | "approved" | "rejected";
  sentDate?: string;
  viewedDate?: string;
}

export interface CommercialContract {
  id: string;
  company: string;
  cnpj: string;
  type: "Contábil" | "Fiscal" | "Pessoal" | "Completo";
  monthlyValue: number;
  startDate: string;
  endDate?: string;
  status: "active" | "suspended" | "cancelled";
  paymentDay: number;
}

export interface CommercialOverviewSummary {
  totalLeads: number;
  activeLeads: number;
  wonLeads: number;
  totalValue: number;
  conversionRate: number;
  activeProposals: number;
  activeContracts: number;
}

export interface CommercialSource {
  name: string;
  value: number;
  color: string;
}

export interface CommercialMonthlyConversion {
  month: string;
  leads: number;
  won: number;
  lost: number;
}

export interface CommercialOverview {
  summary: CommercialOverviewSummary;
  leads: CommercialLead[];
  sources: CommercialSource[];
  monthlyConversions: CommercialMonthlyConversion[];
  proposals: CommercialProposal[];
  contracts: CommercialContract[];
}

export interface CommercialSuccessEnvelope<T> {
  success: boolean;
  data: T;
}

export interface CommercialProposalConfig {
  id: string;
  name: string;
  contract_value: number;
}

export interface CreateCommercialProposalConfigPayload {
  name: string;
  contract_value: number;
}

export type UpdateCommercialProposalConfigPayload = Partial<CreateCommercialProposalConfigPayload>;

export const COMMERCIAL_PROSPECTING_STATUSES = [
  "Análise Financeira",
  "Análise/Agendamento",
  "Envio de Proposta",
  "Paralisado",
  "Recusado pelo Cliente",
  "Fechado",
] as const;

export type CommercialProspectingStatus = (typeof COMMERCIAL_PROSPECTING_STATUSES)[number];

export interface CommercialProspectingClient {
  id: string;
  name: string;
  company_name: string | null;
  fantasy_name: string | null;
}

export interface CommercialProspecting {
  id: string;
  client_id: string;
  status: CommercialProspectingStatus;
  status_date: string | null;
  description: string | null;
  client: CommercialProspectingClient;
}

export interface CreateCommercialProspectingPayload {
  client_id: string;
  status: CommercialProspectingStatus;
  status_date?: string | null;
  description?: string | null;
}

export type UpdateCommercialProspectingPayload = Partial<
  Omit<CreateCommercialProspectingPayload, "client_id">
>;
