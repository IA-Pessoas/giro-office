import React from "react";
import { PieChart as PieChartIcon } from "lucide-react";
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
} from "recharts";
import type { DashboardStats } from '../types';

interface ServiceDistributionChartProps {
  data: DashboardStats['clientsByService'];
}

export function ServiceDistributionChart({ data }: ServiceDistributionChartProps) {
  const barColor = "#3b82f6";
  const lineColor = "#3b82f6";

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
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 shadow-lg">
          <p className="mb-1 font-semibold text-gray-900 dark:text-white">{payload[0].payload.name}</p>
          <p className="text-sm text-gray-600 dark:text-gray-400">Clientes: {payload[0].value}</p>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Percentual: {payload[0].payload.percentage}%
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-1">
        <PieChartIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
        Distribuição por Serviços
      </h3>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">Total: {total} clientes</p>
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.1} />
          <XAxis 
            dataKey="name" 
            stroke="#9ca3af"
            tick={{ fill: "#9ca3af", fontSize: 12 }}
            angle={-45}
            textAnchor="end"
            height={80}
          />
          <YAxis stroke="#9ca3af" tick={{ fill: "#9ca3af", fontSize: 12 }} />
          <Tooltip content={<CustomTooltip />} />
          <Legend 
            wrapperStyle={{ color: "#9ca3af" }}
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
