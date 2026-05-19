import { ChevronDown, Plus } from "lucide-react";

import type { AssignableUser } from "../types";

interface RhTimesheetsFiltersProps {
  assignableUsers: AssignableUser[];
  departments: string[];
  canManageTimesheets: boolean;
  currentUserLabel: string;
  disableGenerate: boolean;
  selectedDepartment: string;
  selectedUserId: string;
  dateFrom: string;
  dateTo: string;
  onDepartmentChange: (value: string) => void;
  onUserChange: (value: string) => void;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  onOpenGenerate: () => void;
}

export function RhTimesheetsFilters({
  assignableUsers,
  departments,
  canManageTimesheets,
  currentUserLabel,
  disableGenerate,
  selectedDepartment,
  selectedUserId,
  dateFrom,
  dateTo,
  onDepartmentChange,
  onUserChange,
  onDateFromChange,
  onDateToChange,
  onOpenGenerate,
}: RhTimesheetsFiltersProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Folhas de ponto</h2>

        {canManageTimesheets ? (
          <button
            type="button"
            onClick={onOpenGenerate}
            disabled={disableGenerate}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Plus className="h-4 w-4" />
            Gerar folha
          </button>
        ) : null}
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,220px)_minmax(0,300px)_200px_200px]">
        {canManageTimesheets ? (
          <>
            <label className="flex min-w-0 flex-col gap-1 text-sm text-gray-600 dark:text-gray-300">
              <span>Departamento</span>
              <div className="relative">
                <select
                  value={selectedDepartment}
                  onChange={(event) => onDepartmentChange(event.target.value)}
                  className="w-full appearance-none rounded-lg border border-gray-300 bg-white px-3 py-2 pr-12 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                >
                  <option value="">Todos</option>
                  {departments.map((department) => (
                    <option key={department} value={department}>
                      {department}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              </div>
            </label>

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
          </>
        ) : null}

        <label className="flex min-w-0 flex-col gap-1 text-sm text-gray-600 dark:text-gray-300">
          <span>Período inicial</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(event) => onDateFromChange(event.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          />
        </label>

        <label className="flex min-w-0 flex-col gap-1 text-sm text-gray-600 dark:text-gray-300">
          <span>Período final</span>
          <input
            type="date"
            value={dateTo}
            onChange={(event) => onDateToChange(event.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          />
        </label>
      </div>
    </div>
  );
}
