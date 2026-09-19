import type { IconType } from 'react-icons';

export type FiscalObligationStatus = 'Pendente' | 'Emitida' | 'Atrasada';

export interface FiscalObligationSummary {
  status: FiscalObligationStatus;
  count: number;
}

export interface DashboardFinancialSummary {
  paidCertificateReceipts: number;
  unpaidCertificates: number;
  monthlyPaidCertificateReceipts: Array<{
    month: string;
    amount: number;
  }>;
}

export interface DashboardCommercialSummary {
  activeProspects: number;
  closedThisMonth: number;
  byStatus: Array<{
    status: string;
    count: number;
  }>;
  billing: {
    pending: number;
    contracted: number;
    notContracted: number;
  };
}

export interface DashboardDepartmentSummary {
  id: string;
  name: string;
  openTasks: number;
  completedTasks: number;
  urgentTasks: number;
}

export interface RecentClientRow {
  id: string;
  name: string;
  status: string;
  segmento: string;
  entryDate: string;
}

export interface DashboardInsight {
  type: 'info' | 'warning' | 'success';
  title: string;
  description: string;
}

export interface DashboardTaskSummary {
  today: number;
  completedToday: number;
  pending: number;
  urgent: number;
}

export interface DashboardNotificationSummary {
  total: number;
  urgent: number;
  pending: number;
}

export interface DashboardProjectSummary {
  active: number;
  completed: number;
  inProgress: number;
  delayed: number;
  waiting: number;
}

export interface DashboardPerformanceEntry {
  week: string;
  tasks: number;
  completed: number;
}

export interface DashboardPendingTask {
  title: string;
  priority: 'Alta' | 'Média' | 'Baixa';
  dueDate: string;
  status: 'pending' | 'urgent';
}

export interface DashboardActivity {
  user: string;
  action: string;
  item: string;
  createdAt: string | null;
  avatar: string;
  tone: 'green' | 'blue' | 'yellow' | 'purple' | 'indigo';
}

export interface DashboardStats {
  updatedAt: string | null;
  totalClients: number;
  clientsByService: {
    contabil: number;
    fiscal: number;
    pessoal: number;
    infoproduto: number;
    consultoria: number;
    castelo_med: number;
  };
  monthlyTrends: Array<{
    month: string;
    newClients: number;
  }>;
  fiscal: {
    obligations: FiscalObligationSummary[];
  };
  financial: DashboardFinancialSummary;
  commercial: DashboardCommercialSummary;
  departments: DashboardDepartmentSummary[];
  recentClients: RecentClientRow[];
  insights: DashboardInsight[];
  tasks: DashboardTaskSummary;
  notifications: DashboardNotificationSummary;
  projects: DashboardProjectSummary;
  performance: DashboardPerformanceEntry[];
  pendingTasks: DashboardPendingTask[];
  activities: DashboardActivity[];
}

export interface StatCardData {
  title: string;
  value: string | number;
  icon: IconType;
  change?: number;
  changeLabel?: string;
  color?: string;
}
