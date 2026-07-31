import React from "react";
import Link from "next/link";
import { Users } from "lucide-react";

import type { DashboardStats } from "../types";

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
  if (s === "active" || s === "ativo") return "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300";
  if (s === "trial") return "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300";
  if (s === "inactive" || s === "inativo") return "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300";
  return "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300";
}

export function RecentClientsTable({ data }: RecentClientsTableProps) {
  return (
    <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 overflow-x-auto u-scrollbar-system">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          Últimos Clientes
        </h3>
      </div>

      <table className="min-w-full text-sm">
        <thead>
          <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
            <th className="py-3">Nome</th>
            <th className="py-3">Status</th>
            <th className="py-3">Segmento</th>
            <th className="py-3">Entrada</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr
              key={row.id}
              className="border-t border-gray-100 dark:border-gray-700/60 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
            >
              <td className="py-3 font-medium">
                <Link href={`/clients/${row.id}`}>
                  <span className="text-blue-600 dark:text-blue-400 hover:underline">
                    {row.name}
                  </span>
                </Link>
              </td>
              <td className="py-3">
                <span className={`rounded-full px-2 py-1 text-xs font-medium ${statusColor(row.status)}`}>
                  {row.status}
                </span>
              </td>
              <td className="py-3 text-gray-700 dark:text-gray-300">{row.segmento}</td>
              <td className="py-3 text-gray-700 dark:text-gray-300">{formatDate(row.entryDate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
