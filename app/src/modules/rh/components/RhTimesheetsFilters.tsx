import { ChevronDown } from "lucide-react";

import type { AssignableUser } from "../types";

interface RhTimesheetsFiltersProps {
  assignableUsers: AssignableUser[];
  canManageTimesheets: boolean;
  selectedUserId: string;
  dateFrom: string;
  dateTo: string;
  onUserChange: (value: string) => void;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
}

export function RhTimesheetsFilters({
  assignableUsers,
  canManageTimesheets,
  selectedUserId,
  dateFrom,
  dateTo,
  onUserChange,
  onDateFromChange,
  onDateToChange,
}: RhTimesheetsFiltersProps) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Folhas de Ponto
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Consulte e acompanhe as folhas de ponto.
        </p>
      </div>

      <div className="flex flex-col gap-3 xl:flex-row xl:flex-wrap xl:items-end">
        {canManageTimesheets ? (
          <label className="flex w-full flex-col gap-1 text-sm text-gray-600 dark:text-gray-300 md:max-w-[320px] xl:flex-1 xl:basis-[280px] xl:max-w-[360px]">
            <span>Colaborador</span>
            <div className="relative">
              <select
                value={selectedUserId}
                onChange={(event) => onUserChange(event.target.value)}
                className="w-full appearance-none rounded-lg border border-gray-300 bg-white px-3 py-2 pr-12 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              >
                <option value="">Meu usuário</option>
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

        <label className="flex w-full flex-col gap-1 text-sm text-gray-600 dark:text-gray-300 md:max-w-[220px] xl:w-[200px]">
          <span>Período inicial</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(event) => onDateFromChange(event.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          />
        </label>

        <label className="flex w-full flex-col gap-1 text-sm text-gray-600 dark:text-gray-300 md:max-w-[220px] xl:w-[200px]">
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
