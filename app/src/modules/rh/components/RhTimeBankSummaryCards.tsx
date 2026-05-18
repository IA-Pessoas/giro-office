import type { RhTimeBankOverview, RhTimeBankSummary } from "../types";

function formatMinutesLabel(minutes: number) {
  const sign = minutes > 0 ? "+" : minutes < 0 ? "-" : "";
  const absoluteMinutes = Math.abs(minutes);
  const hours = Math.floor(absoluteMinutes / 60);
  const remainingMinutes = absoluteMinutes % 60;

  if (hours === 0) {
    return `${sign}${remainingMinutes}min`;
  }

  if (remainingMinutes === 0) {
    return `${sign}${hours}h`;
  }

  return `${sign}${hours}h ${remainingMinutes}min`;
}

interface RhTimeBankSummaryCardsProps {
  currentUserLabel: string;
  selectedUserLabel?: string | null;
  summary: RhTimeBankSummary | null;
  overview: RhTimeBankOverview | null;
  isOverviewMode: boolean;
  isLoading: boolean;
  hasError: boolean;
}

export function RhTimeBankSummaryCards({
  currentUserLabel,
  selectedUserLabel,
  summary,
  overview,
  isOverviewMode,
  isLoading,
  hasError,
}: RhTimeBankSummaryCardsProps) {
  const heading = isOverviewMode
    ? "Visão agregada"
    : selectedUserLabel
      ? `Resumo de ${selectedUserLabel}`
      : `Resumo de ${currentUserLabel}`;
  const description = isOverviewMode
    ? "Indicadores gerais de banco de horas para todos os colaboradores filtrados."
    : "Saldo e volume de lançamentos aprovados e pendentes para o contexto selecionado.";

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">{heading}</h3>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{description}</p>
      </div>

      {isLoading ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-5 text-sm text-gray-600 dark:border-gray-700 dark:text-gray-300">
          Carregando resumo do banco de horas...
        </div>
      ) : null}

      {!isLoading && hasError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/10 dark:text-red-300">
          Não foi possível carregar o resumo do banco de horas.
        </div>
      ) : null}

      {!isLoading && !hasError ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {isOverviewMode && overview ? (
            <>
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-700/30">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">
                  Pendentes
                </p>
                <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
                  {overview.total_pending_releases}
                </p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-700/30">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">
                  Aprovados
                </p>
                <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
                  {overview.total_approved_releases}
                </p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-700/30">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">
                  Saldo positivo
                </p>
                <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
                  {overview.users_with_positive_balance}
                </p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-700/30">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">
                  Saldo negativo
                </p>
                <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
                  {overview.users_with_negative_balance}
                </p>
              </div>
            </>
          ) : summary ? (
            <>
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-700/30">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">
                  Saldo atual
                </p>
                <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
                  {formatMinutesLabel(summary.balance_minutes)}
                </p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-700/30">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">
                  Aprovados
                </p>
                <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
                  {summary.approved_releases_count}
                </p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-700/30">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">
                  Pendentes
                </p>
                <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
                  {summary.pending_releases_count}
                </p>
              </div>
            </>
          ) : (
            <div className="rounded-lg border border-dashed border-gray-300 p-5 text-sm text-gray-600 dark:border-gray-700 dark:text-gray-300 md:col-span-2 xl:col-span-4">
              Nenhum resumo disponível para o contexto selecionado.
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
