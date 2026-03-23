import React from 'react';
import { FiUsers, FiTrendingUp, FiActivity } from 'react-icons/fi';
import { StatCard } from './StatCard';
import { ServiceDistributionChart } from './ServiceDistributionChart';
import { ClientTrendsChart } from './ClientTrendsChart';
import { QuickActions } from './QuickActions';
import { FiscalObligationsChart } from './FiscalObligationsChart';
import { InsightsPanel } from './InsightsPanel';
import { RecentClientsTable } from './RecentClientsTable';
import { LoadingSpinner } from '@shared/components/LoadingSpinner';
import type { DashboardStats } from '../types';

interface DashboardGridProps {
  stats: DashboardStats | null;
  isLoading: boolean;
}

export function DashboardGrid({ stats, isLoading }: DashboardGridProps) {
  const cardColor = 'var(--colors-blue-500)';

  if (isLoading) {
    return (
      <div className="u-flex u-items-center u-justify-between" style={{ minHeight: 400, justifyContent: 'center' }}>
        <LoadingSpinner />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="py-10 text-center">
        <p className="text-sm text-slate-500">Nenhum dado disponível</p>
      </div>
    );
  }

  const totalServices = Object.values(stats.clientsByService).reduce((a, b) => a + b, 0);
  const avgNewClients = stats.monthlyTrends.length > 0
    ? Math.round(stats.monthlyTrends.reduce((a, b) => a + b.newClients, 0) / stats.monthlyTrends.length)
    : 0;

  return (
    <section className="u-stack u-gap-4 min-h-screen p-4 md:p-6">
      <QuickActions />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        <StatCard
          data={{
            title: 'Total de Clientes',
            value: stats.totalClients,
            icon: FiUsers,
            color: cardColor,
          }}
          delay={0}
        />
        <StatCard
          data={{
            title: 'Clientes por Serviços',
            value: totalServices,
            icon: FiActivity,
            color: cardColor,
          }}
          delay={0.1}
        />
        <StatCard
          data={{
            title: 'Média Mensal',
            value: avgNewClients,
            icon: FiTrendingUp,
            changeLabel: 'novos clientes/mês',
            color: cardColor,
          }}
          delay={0.2}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <FiscalObligationsChart data={stats.fiscal.obligations} />
        <InsightsPanel insights={stats.insights} />
      </div>

      <div>
        <RecentClientsTable data={stats.recentClients} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ServiceDistributionChart data={stats.clientsByService} />
        <ClientTrendsChart data={stats.monthlyTrends} />
      </div>
    </section>
  );
}
