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

export interface DashboardStats {
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
}

export interface StatCardData {
  title: string;
  value: string | number;
  icon: IconType;
  change?: number;
  changeLabel?: string;
  color?: string;
}
