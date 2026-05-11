import { ChevronDown, Plus } from "lucide-react";

import type { AssignableUser } from "../types";

export type RhTimeBankStatusFilter = "all" | "pending" | "approved";

interface RhTimeBankFiltersProps {
  assignableUsers: AssignableUser[];
  canManageTimeBank: boolean;
  selectedUserId: string;
  selectedStatus: RhTimeBankStatusFilter;
  dateFrom: string;
  dateTo: string;
  onUserChange: (value: string) => void;
  onStatusChange: (value: RhTimeBankStatusFilter) => void;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  onOpenCreate: () => void;
}

export function RhTimeBankFilters({
  assignableUsers,
  canManageTimeBank,
  selectedUserId,
  selectedStatus,
  dateFrom,
  dateTo,
  onUserChange,
  onStatusChange,
  onDateFromChange,
  onDateToChange,
  onOpenCreate,
}: RhTimeBankFiltersProps) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Banco de horas
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Consulte e gerencie os lancamentos de banco de horas.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-end">
        {canManageTimeBank ? (
          <label className="flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-300">
            <span>Colaborador</span>
            <div className="relative">
              <select
                value={selectedUserId}
                onChange={(event) => onUserChange(event.target.value)}
                className="min-w-[220px] appearance-none rounded-lg border border-gray-300 bg-white px-3 py-2 pr-12 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              >
                <option value="">Todos</option>
                {assignableUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            </div>
          </label>
        ) : null}

        <label className="flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-300">
          <span>Periodo inicial</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(event) => onDateFromChange(event.target.value)}
            className="min-w-[180px] rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-300">
          <span>Periodo final</span>
          <input
            type="date"
            value={dateTo}
            onChange={(event) => onDateToChange(event.target.value)}
            className="min-w-[180px] rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-300">
          <span>Status</span>
          <div className="relative">
            <select
              value={selectedStatus}
              onChange={(event) =>
                onStatusChange(event.target.value as RhTimeBankStatusFilter)
              }
              className="min-w-[180px] appearance-none rounded-lg border border-gray-300 bg-white px-3 py-2 pr-12 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            >
              <option value="all">Todos</option>
              <option value="pending">Pendentes</option>
              <option value="approved">Aprovados</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          </div>
        </label>

        {canManageTimeBank ? (
          <button
            type="button"
            onClick={onOpenCreate}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Novo lancamento
          </button>
        ) : null}
      </div>
    </div>
  );
}
