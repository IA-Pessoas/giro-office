import { formatRhDateTime } from "../utils/rhDate";
import type { RhTodayPoint } from "../types";

interface RhPointTodayCardProps {
  currentUserName: string;
  todayPoint: RhTodayPoint | null;
  isLoading: boolean;
  hasError: boolean;
  isRegistering: boolean;
  onRegister: () => void;
}

function renderValue(value: string | null | undefined) {
  return value ? formatRhDateTime(value) : "-";
}

export function RhPointTodayCard({
  currentUserName,
  todayPoint,
  isLoading,
  hasError,
  isRegistering,
  onRegister,
}: RhPointTodayCardProps) {
  const canRegister = Boolean(todayPoint?.next_action) && !isRegistering;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">
            Meu ponto hoje
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Cartão do dia do usuário autenticado.
          </p>
        </div>
        <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
          {currentUserName}
        </span>
      </div>

      <div className="mt-4 rounded-lg border border-dashed border-gray-300 px-4 py-6 text-sm text-gray-600 dark:border-gray-700 dark:text-gray-300">
        {isLoading ? (
          <span>Carregando seu ponto de hoje...</span>
        ) : hasError ? (
          <span>Não foi possível carregar seu ponto de hoje.</span>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Próxima ação</p>
                <p className="text-base font-semibold text-gray-900 dark:text-white">
                  {todayPoint?.next_action ?? "Jornada concluída"}
                </p>
              </div>

              <button
                type="button"
                onClick={onRegister}
                disabled={!canRegister}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isRegistering
                  ? "Registrando..."
                  : todayPoint?.next_action
                    ? `Registrar ${todayPoint.next_action}`
                    : "Sem ação disponível"}
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div>
                <p className="text-xs uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">
                  Entrada
                </p>
                <p className="mt-1 text-sm text-gray-900 dark:text-white">
                  {renderValue(todayPoint?.point?.clock_in)}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">
                  Saída almoço
                </p>
                <p className="mt-1 text-sm text-gray-900 dark:text-white">
                  {renderValue(todayPoint?.point?.lunch_out)}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">
                  Volta almoço
                </p>
                <p className="mt-1 text-sm text-gray-900 dark:text-white">
                  {renderValue(todayPoint?.point?.lunch_in)}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">
                  Saída
                </p>
                <p className="mt-1 text-sm text-gray-900 dark:text-white">
                  {renderValue(todayPoint?.point?.clock_out)}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
