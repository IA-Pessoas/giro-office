import { useMemo } from "react";

import { useRhHolidays } from "../hooks/useRhCalendar";
import { RhHolidaysTable } from "./RhHolidaysTable";

export function RhHolidaysSection() {
  const holidaysQuery = useRhHolidays();
  const holidays = holidaysQuery.data ?? [];

  const sortedHolidays = useMemo(
    () => [...holidays].sort((left, right) => left.date.localeCompare(right.date)),
    [holidays],
  );

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          Feriados
        </h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Gerencie os feriados administrativos utilizados pelo RH.
        </p>
      </div>

      {holidaysQuery.isLoading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
          Carregando feriados...
        </div>
      ) : null}

      {!holidaysQuery.isLoading && holidaysQuery.error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/10 dark:text-red-300">
          Não foi possível carregar os feriados de RH.
        </div>
      ) : null}

      {!holidaysQuery.isLoading &&
      !holidaysQuery.error &&
      sortedHolidays.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
          Nenhum feriado cadastrado até o momento.
        </div>
      ) : null}

      {!holidaysQuery.isLoading &&
      !holidaysQuery.error &&
      sortedHolidays.length > 0 ? (
        <RhHolidaysTable holidays={sortedHolidays} />
      ) : null}
    </div>
  );
}
