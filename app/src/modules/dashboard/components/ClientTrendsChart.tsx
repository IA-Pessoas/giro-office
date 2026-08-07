import React from "react";
import { TrendingUp } from "lucide-react";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  AreaChart,
} from '../../../shared/components/charts/LazyRecharts';
import type { DashboardStats } from '../types';

interface ClientTrendsChartProps {
  data: DashboardStats['monthlyTrends'];
}

export function ClientTrendsChart({ data }: ClientTrendsChartProps) {
  const areaColor = "#3b82f6";
  const lineColor = "#3b82f6";

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 shadow-lg">
          <p className="mb-1 font-semibold text-gray-900 dark:text-white">{payload[0].payload.month}</p>
          <p className="text-sm text-gray-600 dark:text-gray-400">Novos Clientes: {payload[0].value}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-1">
        <TrendingUp className="w-5 h-5 text-blue-600 dark:text-blue-400" />
        Tendência de Novos Clientes
      </h3>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">Últimos {data.length} meses</p>
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="colorNewClients" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={areaColor} stopOpacity={0.3} />
              <stop offset="95%" stopColor={areaColor} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.1} />
          <XAxis 
            dataKey="month" 
            stroke="#9ca3af"
            tick={{ fill: "#9ca3af", fontSize: 12 }}
          />
          <YAxis stroke="#9ca3af" tick={{ fill: "#9ca3af", fontSize: 12 }} />
          <Tooltip content={<CustomTooltip />} />
          <Legend 
            wrapperStyle={{ color: "#9ca3af" }}
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
