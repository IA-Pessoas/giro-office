import { ChevronDown } from "lucide-react";

import type { AssignableUser, RhPointAdjustmentStatus } from "../types";

interface RhPointFiltersProps {
  assignableUsers: AssignableUser[];
  canManagePoint: boolean;
  currentUserLabel: string;
  selectedUserId: string;
  month: string;
  selectedAdjustmentStatus: "" | RhPointAdjustmentStatus;
  onUserChange: (value: string) => void;
  onMonthChange: (value: string) => void;
  onAdjustmentStatusChange: (value: "" | RhPointAdjustmentStatus) => void;
}

export function RhPointFilters({
  assignableUsers,
  canManagePoint,
  currentUserLabel,
  selectedUserId,
  month,
  selectedAdjustmentStatus,
  onUserChange,
  onMonthChange,
  onAdjustmentStatusChange,
}: RhPointFiltersProps) {
  return (
    <div className="w-full min-w-0 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Registros de ponto
        </h2>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {canManagePoint ? (
          <label className="flex min-w-0 flex-col gap-1 text-sm text-gray-600 dark:text-gray-300">
            <span>Colaborador</span>
            <div className="relative">
              <select
                value={selectedUserId}
                onChange={(event) => onUserChange(event.target.value)}
                className="w-full appearance-none rounded-lg border border-gray-300 bg-white px-3 py-2 pr-12 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              >
                <option value="">{currentUserLabel}</option>
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

        <label className="flex min-w-0 flex-col gap-1 text-sm text-gray-600 dark:text-gray-300">
          <span>Mês</span>
          <input
            type="month"
            value={month}
            onChange={(event) => onMonthChange(event.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          />
        </label>

        <label className="flex min-w-0 flex-col gap-1 text-sm text-gray-600 dark:text-gray-300">
          <span>Ajustes</span>
          <div className="relative">
            <select
              value={selectedAdjustmentStatus}
              onChange={(event) =>
                onAdjustmentStatusChange(event.target.value as "" | RhPointAdjustmentStatus)
              }
              className="w-full appearance-none rounded-lg border border-gray-300 bg-white px-3 py-2 pr-12 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            >
              <option value="">Todos</option>
              <option value="Pendente">Pendentes</option>
              <option value="Aprovado">Aprovados</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          </div>
        </label>
      </div>
    </div>
  );
}
