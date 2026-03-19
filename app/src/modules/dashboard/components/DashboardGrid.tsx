import React from 'react';
import { Grid, Box, Spinner, Text, useColorModeValue } from '@chakra-ui/react';
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
  const bgColor = useColorModeValue('bodyBg', 'bodyBg');
  const cardColor = useColorModeValue('#2f406a', '#d0ab70');

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minH="400px">
        <LoadingSpinner />
      </Box>
    );
  }

  if (!stats) {
    return (
      <Box textAlign="center" py={10}>
        <Text color="gray.500">Nenhum dado disponível</Text>
      </Box>
    );
  }

  const totalServices = Object.values(stats.clientsByService).reduce((a, b) => a + b, 0);
  const avgNewClients = stats.monthlyTrends.length > 0
    ? Math.round(stats.monthlyTrends.reduce((a, b) => a + b.newClients, 0) / stats.monthlyTrends.length)
    : 0;

  return (
    <Box bg={bgColor} p={{ base: 4, md: 6 }} minH="100vh">
      <QuickActions />
      
      <Grid
        templateColumns={{
          base: '1fr',
          md: 'repeat(2, 1fr)',
          lg: 'repeat(3, 1fr)',
        }}
        gap={6}
        mb={6}
      >
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
      </Grid>

      <Grid
        templateColumns={{
          base: '1fr',
          lg: 'repeat(2, 1fr)',
        }}
        gap={6}
        mb={6}
      >
        <FiscalObligationsChart data={stats.fiscal.obligations} />
        <InsightsPanel insights={stats.insights} />
      </Grid>

      <Box mb={6}>
        <RecentClientsTable data={stats.recentClients} />
      </Box>

      <Grid
        templateColumns={{
          base: '1fr',
          lg: 'repeat(2, 1fr)',
        }}
        gap={6}
      >
        <ServiceDistributionChart data={stats.clientsByService} />
        <ClientTrendsChart data={stats.monthlyTrends} />
      </Grid>
    </Box>
  );
}
