export interface CommercialDashboardSummary {
  totalClients: number;
  prospectingClients: number;
  closedClients: number;
  activeClients: number;
  inactiveClients: number;
  commercialTasks: number;
  openCommercialTasks: number;
  conversionRate: number;
}

export interface CommercialFunnelItem {
  status: string;
  count: number;
}

export interface CommercialTaskStatusItem {
  status: string;
  count: number;
}

export interface CommercialTaskRow {
  id: string;
  name: string;
  status: string;
  hiringStatus: string | null;
  payment: string | null;
}

export interface CommercialProspectRow {
  id: string;
  name: string;
  status: string;
  company: string;
}

export interface CommercialDashboardStats {
  summary: CommercialDashboardSummary;
  funnel: CommercialFunnelItem[];
  commercialTasks: {
    total: number;
    open: number;
    completed: number;
    byStatus: CommercialTaskStatusItem[];
    recent: CommercialTaskRow[];
  };
  recentProspects: CommercialProspectRow[];
}
