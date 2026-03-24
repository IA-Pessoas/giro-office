import React from 'react';
import {
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
} from 'recharts';
import type { DashboardStats } from '../types';

interface ServiceDistributionChartProps {
  data: DashboardStats['clientsByService'];
}

export function ServiceDistributionChart({ data }: ServiceDistributionChartProps) {
  const textColor = 'var(--dashboard-text-color, #334155)';
  const gridColor = '#e2e8f0';
  const barColor = '#2f406a';
  const lineColor = '#d0ab70';

  const chartData = [
    {
      name: 'Contábil',
      value: data.contabil,
      percentage: ((data.contabil / Object.values(data).reduce((a, b) => a + b, 0)) * 100).toFixed(1),
    },
    {
      name: 'Fiscal',
      value: data.fiscal,
      percentage: ((data.fiscal / Object.values(data).reduce((a, b) => a + b, 0)) * 100).toFixed(1),
    },
    {
      name: 'Pessoal',
      value: data.pessoal,
      percentage: ((data.pessoal / Object.values(data).reduce((a, b) => a + b, 0)) * 100).toFixed(1),
    },
    {
      name: 'Infoproduto',
      value: data.infoproduto,
      percentage: ((data.infoproduto / Object.values(data).reduce((a, b) => a + b, 0)) * 100).toFixed(1),
    },
    {
      name: 'Consultoria',
      value: data.consultoria,
      percentage: ((data.consultoria / Object.values(data).reduce((a, b) => a + b, 0)) * 100).toFixed(1),
    },
    {
      name: 'Castelo Med',
      value: data.castelo_med,
      percentage: ((data.castelo_med / Object.values(data).reduce((a, b) => a + b, 0)) * 100).toFixed(1),
    },
  ];

  const total = Object.values(data).reduce((a, b) => a + b, 0);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="rounded-md border border-slate-200 bg-white p-3 shadow-lg">
          <p className="mb-2 font-bold" style={{ color: textColor }}>
            {payload[0].payload.name}
          </p>
          <p className="text-sm" style={{ color: textColor }}>
            Clientes: {payload[0].value}
          </p>
          <p className="text-sm" style={{ color: textColor }}>
            Percentual: {payload[0].payload.percentage}%
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <section className="dashboard-card">
      <h3 className="dashboard-card-title mb-4" style={{ color: textColor }}>
        Distribuição por Serviços
      </h3>
      <p className="dashboard-card-subtitle mb-4">
        Total: {total} clientes
      </p>
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
          <XAxis 
            dataKey="name" 
            tick={{ fill: textColor, fontSize: 12 }}
            angle={-45}
            textAnchor="end"
            height={80}
          />
          <YAxis tick={{ fill: textColor, fontSize: 12 }} />
          <Tooltip content={<CustomTooltip />} />
          <Legend 
            wrapperStyle={{ color: textColor }}
            iconType="circle"
          />
          <Bar 
            dataKey="value" 
            fill={barColor}
            name="Clientes"
            radius={[8, 8, 0, 0]}
          />
          <Line 
            type="monotone" 
            dataKey="value" 
            stroke={lineColor}
            strokeWidth={2}
            dot={{ fill: lineColor, r: 4 }}
            name="Tendência"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </section>
  );
}
