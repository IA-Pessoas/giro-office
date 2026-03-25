import React from 'react';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  AreaChart,
} from 'recharts';
import type { DashboardStats } from '../types';

interface ClientTrendsChartProps {
  data: DashboardStats['monthlyTrends'];
}

export function ClientTrendsChart({ data }: ClientTrendsChartProps) {
  const textColor = 'var(--dashboard-text-color, #334155)';
  const gridColor = '#e2e8f0';
  const areaColor = '#2f406a';
  const lineColor = '#d0ab70';

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="rounded-md border border-slate-200 bg-white p-3 shadow-lg">
          <p className="mb-2 font-bold" style={{ color: textColor }}>
            {payload[0].payload.month}
          </p>
          <p className="text-sm" style={{ color: textColor }}>
            Novos Clientes: {payload[0].value}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <section className="dashboard-card">
      <h3 className="dashboard-card-title mb-4" style={{ color: textColor }}>
        Tendência de Novos Clientes
      </h3>
      <p className="dashboard-card-subtitle mb-4">
        Últimos {data.length} meses
      </p>
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="colorNewClients" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={areaColor} stopOpacity={0.3} />
              <stop offset="95%" stopColor={areaColor} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
          <XAxis 
            dataKey="month" 
            tick={{ fill: textColor, fontSize: 12 }}
          />
          <YAxis tick={{ fill: textColor, fontSize: 12 }} />
          <Tooltip content={<CustomTooltip />} />
          <Legend 
            wrapperStyle={{ color: textColor }}
            iconType="circle"
          />
          <Area
            type="monotone"
            dataKey="newClients"
            stroke={lineColor}
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#colorNewClients)"
            name="Novos Clientes"
          />
        </AreaChart>
      </ResponsiveContainer>
    </section>
  );
}
