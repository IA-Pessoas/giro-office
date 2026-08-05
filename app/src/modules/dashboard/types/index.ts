import type { IconType } from 'react-icons';

export type FiscalObligationStatus = 'Pendente' | 'Emitida' | 'Atrasada';

export interface FiscalObligationSummary {
  status: FiscalObligationStatus;
  count: number;
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

export interface DashboardRevenueSummary {
  currentMonth: number;
  target: number;
  monthly: Array<{
    month: string;
    revenue: number;
    expenses: number;
  }>;
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
  recentClients: RecentClientRow[];
  insights: DashboardInsight[];
  tasks: DashboardTaskSummary;
  notifications: DashboardNotificationSummary;
  projects: DashboardProjectSummary;
  revenue: DashboardRevenueSummary;
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
