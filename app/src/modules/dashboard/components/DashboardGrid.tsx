import React from "react";
import dynamic from "next/dynamic";
import { FiActivity, FiTrendingUp, FiUsers } from "react-icons/fi";
import { LoadingSpinner } from "@shared/components/LoadingSpinner";

import type { DashboardStats } from "../types";
import { ChartSkeleton } from "../../../shared/components/charts/ChartSkeleton";
import { InsightsPanel } from "./InsightsPanel";
import { QuickActions } from "./QuickActions";
import { RecentClientsTable } from "./RecentClientsTable";
import { StatCard } from "./StatCard";

const ServiceDistributionChart = dynamic(
  () => import("./ServiceDistributionChart").then((mod) => mod.ServiceDistributionChart),
  { ssr: false, loading: () => <ChartSkeleton height={240} /> },
);

const ClientTrendsChart = dynamic(
  () => import("./ClientTrendsChart").then((mod) => mod.ClientTrendsChart),
  { ssr: false, loading: () => <ChartSkeleton height={240} /> },
);

interface DashboardGridProps {
  stats: DashboardStats | null;
  isLoading: boolean;
}

export function DashboardGrid({ stats, isLoading }: DashboardGridProps) {
  const cardColor = "var(--colors-brand-blue)";

  if (isLoading) {
    return (
      <div
        className="flex items-center justify-center"
        style={{ minHeight: 400 }}
      >
        <LoadingSpinner />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="py-10 text-center">
        <p className="text-sm text-gray-600 dark:text-gray-400">Nenhum dado disponível</p>
      </div>
    );
  }

  const totalServices = Object.values(stats.clientsByService).reduce((a, b) => a + b, 0);
  const avgNewClients = stats.monthlyTrends.length > 0
    ? Math.round(stats.monthlyTrends.reduce((a, b) => a + b.newClients, 0) / stats.monthlyTrends.length)
    : 0;

  return (
    <section className="space-y-6">
      <QuickActions />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
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

      <InsightsPanel insights={stats.insights} />

      <div>
        <RecentClientsTable data={stats.recentClients} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ServiceDistributionChart data={stats.clientsByService} />
        <ClientTrendsChart data={stats.monthlyTrends} />
      </div>
    </section>
  );
}
