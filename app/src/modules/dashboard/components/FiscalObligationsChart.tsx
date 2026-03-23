import React from 'react';
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
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
  const textColor = '#334155';
  const gridColor = '#e2e8f0';
  const pendingColor = '#2f406a';
  const issuedColor = '#48BB78';
  const overdueColor = '#EF4444';

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
      <div className="rounded-md border border-slate-200 bg-white p-3 shadow-lg">
        <p className="font-bold" style={{ color: textColor }}>
          {p.payload.status}
        </p>
        <p className="text-sm" style={{ color: textColor }}>
          Quantidade: {p.value}
        </p>
      </div>
    );
  };

  return (
    <section className="dashboard-card">
      <h3 className="dashboard-card-title mb-4" style={{ color: textColor }}>
        Fiscal: Obrigações/Guias
      </h3>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
          <XAxis dataKey="status" tick={{ fill: textColor, fontSize: 12 }} />
          <YAxis tick={{ fill: textColor, fontSize: 12 }} />
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
          <span className="text-xs text-slate-500">Pendentes</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-[10px] w-[10px] rounded-full" style={{ background: issuedColor }} />
          <span className="text-xs text-slate-500">Emitidas</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-[10px] w-[10px] rounded-full" style={{ background: overdueColor }} />
          <span className="text-xs text-slate-500">Atrasadas</span>
        </div>
      </div>
    </section>
  );
}
