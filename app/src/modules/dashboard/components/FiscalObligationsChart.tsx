import React from "react";
import { BarChart3 } from "lucide-react";
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from '../../../shared/components/charts/LazyRecharts';
import type { DashboardStats, FiscalObligationStatus } from '../types';

interface FiscalObligationsChartProps {
  data: DashboardStats['fiscal']['obligations'];
}

const STATUS_LABEL: Record<FiscalObligationStatus, string> = {
  Pendente: 'Pendentes',
  Emitida: 'Emitidas',
  Atrasada: 'Atrasadas',
};

export function FiscalObligationsChart({ data }: FiscalObligationsChartProps) {
  const pendingColor = "#2f406a";
  const issuedColor = "#48BB78";
  const overdueColor = "#EF4444";

  const chartData = data.map((item) => ({
    status: STATUS_LABEL[item.status],
    count: item.count,
    statusKey: item.status,
  }));

  const barFill = (status: FiscalObligationStatus) => {
    if (status === 'Pendente') return pendingColor;
    if (status === 'Emitida') return issuedColor;
    return overdueColor;
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const p = payload[0];
    return (
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 shadow-lg">
        <p className="font-semibold text-gray-900 dark:text-white">{p.payload.status}</p>
        <p className="text-sm text-gray-600 dark:text-gray-400">Quantidade: {p.value}</p>
      </div>
    );
  };

  return (
    <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-6">
        <BarChart3 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
        Fiscal: Obrigações/Guias
      </h3>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.1} />
          <XAxis dataKey="status" stroke="#9ca3af" tick={{ fill: "#9ca3af", fontSize: 12 }} />
          <YAxis stroke="#9ca3af" tick={{ fill: "#9ca3af", fontSize: 12 }} />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="count" name="Quantidade" radius={[8, 8, 0, 0]}>
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={barFill(entry.statusKey)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-3 flex flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <span className="h-[10px] w-[10px] rounded-full" style={{ background: pendingColor }} />
          <span className="text-xs text-gray-600 dark:text-gray-400">Pendentes</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-[10px] w-[10px] rounded-full" style={{ background: issuedColor }} />
          <span className="text-xs text-gray-600 dark:text-gray-400">Emitidas</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-[10px] w-[10px] rounded-full" style={{ background: overdueColor }} />
          <span className="text-xs text-gray-600 dark:text-gray-400">Atrasadas</span>
        </div>
      </div>
    </section>
  );
}
