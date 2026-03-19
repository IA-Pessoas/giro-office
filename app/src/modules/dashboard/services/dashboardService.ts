import { setupAPIClient } from '@shared/services/api';
import type { DashboardStats } from '../types';

export const dashboardService = {
  getStats: async (): Promise<DashboardStats> => {
    const api = setupAPIClient();
    
    try {
      const response = await api.get('/dashboard/stats');
      return response.data;
    } catch (error) {
      console.warn('Dashboard API not available, using mock data:', error);
      return dashboardService.getMockStats();
    }
  },

  getMockStats: (): DashboardStats => {
    const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const currentMonth = new Date().getMonth();
    const last6Months = months.slice(Math.max(0, currentMonth - 5), currentMonth + 1);

    const monthlyTrends = last6Months.map((month) => ({
      month,
      newClients: Math.floor(Math.random() * 20) + 5,
    }));

    const fiscalObligations = [
      { status: 'Pendente' as const, count: 18 },
      { status: 'Emitida' as const, count: 42 },
      { status: 'Atrasada' as const, count: 7 },
    ];

    const totalObligations = fiscalObligations.reduce((acc, item) => acc + item.count, 0);
    const overdue = fiscalObligations.find((o) => o.status === 'Atrasada')?.count ?? 0;
    const dominant = [...fiscalObligations].sort((a, b) => b.count - a.count)[0];

    const last = monthlyTrends[monthlyTrends.length - 1]?.newClients ?? 0;
    const prev = monthlyTrends[monthlyTrends.length - 2]?.newClients ?? 0;
    const isDown = monthlyTrends.length >= 2 && last < prev;

    return {
      totalClients: 245,
      clientsByService: {
        contabil: 180,
        fiscal: 145,
        pessoal: 120,
        infoproduto: 45,
        consultoria: 35,
        castelo_med: 25,
      },
      monthlyTrends,
      fiscal: {
        obligations: fiscalObligations,
      },
      recentClients: [
        {
          id: 'c_001',
          name: 'Alpha Serviços LTDA',
          status: 'active',
          segmento: 'Comércio',
          entryDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        },
        {
          id: 'c_002',
          name: 'Beta Consultoria ME',
          status: 'trial',
          segmento: 'Consultoria',
          entryDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        },
        {
          id: 'c_003',
          name: 'Gamma Comércio EIRELI',
          status: 'inactive',
          segmento: 'Indústria',
          entryDate: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toISOString(),
        },
        {
          id: 'c_004',
          name: 'Delta Holdings S/A',
          status: 'active',
          segmento: 'Marketing Digital',
          entryDate: new Date(Date.now() - 13 * 24 * 60 * 60 * 1000).toISOString(),
        },
        {
          id: 'c_005',
          name: 'Epsilon Tech Ltda',
          status: 'active',
          segmento: 'Tecnologia',
          entryDate: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
        },
      ],
      insights: [
        ...(overdue >= 10
          ? [
              {
                type: 'warning' as const,
                title: 'Atrasos no Fiscal',
                description: `Há ${overdue} obrigações atrasadas. Priorize a regularização.`,
              },
            ]
          : [
              {
                type: 'success' as const,
                title: 'Fiscal sob controle',
                description: `Atrasadas: ${overdue} de ${totalObligations} obrigações.`,
              },
            ]),
        {
          type: 'info' as const,
          title: 'Status dominante',
          description: `${dominant.status}: ${dominant.count} de ${totalObligations} obrigações.`,
        },
        ...(isDown
          ? [
              {
                type: 'warning' as const,
                title: 'Queda em novos clientes',
                description: `Último mês (${last}) abaixo do anterior (${prev}).`,
              },
            ]
          : [
              {
                type: 'success' as const,
                title: 'Crescimento consistente',
                description: `Último mês (${last}) vs anterior (${prev}).`,
              },
            ]),
      ],
    };
  },
};
