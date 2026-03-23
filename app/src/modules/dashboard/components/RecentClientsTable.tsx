import React from 'react';
import Link from 'next/link';
import type { DashboardStats, RecentClientRow } from '../types';

interface RecentClientsTableProps {
  data: DashboardStats['recentClients'];
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('pt-BR');
  } catch {
    return iso;
  }
}

function statusColor(status: string) {
  const s = status.toLowerCase();
  if (s === 'active' || s === 'ativo') return 'bg-green-100 text-green-700';
  if (s === 'trial') return 'bg-yellow-100 text-yellow-700';
  if (s === 'inactive' || s === 'inativo') return 'bg-red-100 text-red-700';
  return 'bg-slate-100 text-slate-700';
}

export function RecentClientsTable({ data }: RecentClientsTableProps) {
  return (
    <section className="overflow-x-auto rounded-md border-l-4 border-[var(--colors-blue-500)] bg-white p-6 shadow-md">
      <h3 className="mb-4 text-lg font-bold text-slate-700">
        Últimos Clientes
      </h3>

      <table className="min-w-full text-sm">
        <thead>
          <tr className="text-left text-slate-500">
            <th className="py-2">Nome</th>
            <th className="py-2">Status</th>
            <th className="py-2">Segmento</th>
            <th className="py-2">Entrada</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50">
              <td className="py-2 font-medium">
                <Link href={`/clients/${row.id}`}>
                  <span className="text-[var(--colors-blue-500)] hover:underline">
                    {row.name}
                  </span>
                </Link>
              </td>
              <td className="py-2">
                <span className={`rounded px-2 py-1 text-xs font-medium ${statusColor(row.status)}`}>
                  {row.status}
                </span>
              </td>
              <td className="py-2">{row.segmento}</td>
              <td className="py-2">{formatDate(row.entryDate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

