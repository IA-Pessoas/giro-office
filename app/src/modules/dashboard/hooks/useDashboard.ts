import { useState, useEffect } from 'react';
import { dashboardService } from '../services/dashboardService';
import type { DashboardStats } from '../types';

export const useDashboard = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchStats = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await dashboardService.getStats();
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch dashboard stats'));
      console.error('Error fetching dashboard stats:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  return {
    stats,
    isLoading,
    error,
    refetch: fetchStats,
  };
};
