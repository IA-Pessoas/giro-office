import { setupAPIClient } from '@shared/services/api';
import type { DashboardStats } from '../types';
import { normalizeDashboardStats } from './dashboardStats';

interface DashboardStatsEnvelope {
  success?: boolean;
  data?: DashboardStats;
}

export function unwrapDashboardStats(payload: DashboardStats | DashboardStatsEnvelope): DashboardStats {
  if (payload && typeof payload === 'object' && 'data' in payload && payload.data) {
    return payload.data;
  }

  return payload as DashboardStats;
}

export const dashboardService = {
  getStats: async (): Promise<DashboardStats> => {
    const api = setupAPIClient();
    const response = await api.get('/dashboard/stats');

    return normalizeDashboardStats(unwrapDashboardStats(response.data));
  },
};
