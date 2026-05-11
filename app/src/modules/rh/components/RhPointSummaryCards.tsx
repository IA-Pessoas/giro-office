import type { RhPointMonthlySummary } from "../types";

interface RhPointSummaryCardsProps {
  summary: RhPointMonthlySummary | null;
  isLoading: boolean;
  hasError: boolean;
}

function formatMinutesLabel(totalMinutes: number) {
  const signal = totalMinutes < 0 ? "-" : "";
  const absoluteMinutes = Math.abs(totalMinutes);
  const hours = Math.floor(absoluteMinutes / 60);
  const minutes = absoluteMinutes % 60;

  return `${signal}${hours}h${String(minutes).padStart(2, "0")}`;
}

const CARD_CONFIG = [
  {
    title: "Horas trabalhadas",
    getValue: (summary: RhPointMonthlySummary) =>
      formatMinutesLabel(summary.total_worked_minutes),
  },
  {
    title: "Saldo do mês",
    getValue: (summary: RhPointMonthlySummary) => formatMinutesLabel(summary.balance_minutes),
  },
  {
    title: "Horas extras",
    getValue: (summary: RhPointMonthlySummary) =>
      formatMinutesLabel(summary.overtime_minutes),
  },
  {
    title: "Ajustes pendentes",
    getValue: (summary: RhPointMonthlySummary) => String(summary.pending_adjustments),
  },
];

export function RhPointSummaryCards({
  summary,
  isLoading,
  hasError,
}: RhPointSummaryCardsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {CARD_CONFIG.map((card) => (
        <div
          key={card.title}
          className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800"
        >
          <p className="text-sm text-gray-600 dark:text-gray-400">{card.title}</p>
          <div className="mt-3 rounded-lg border border-dashed border-gray-300 px-4 py-5 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
            {isLoading
              ? "Carregando resumo..."
              : hasError
                ? "Falha ao carregar resumo."
                : summary
                  ? card.getValue(summary)
                  : "Sem resumo disponível."}
          </div>
        </div>
      ))}
    </div>
  );
}
