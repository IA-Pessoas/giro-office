import { isAxiosError } from "axios";

import type { RhPointMonthlySummary } from "../types";
import { formatRhDuration } from "../utils/rhDuration";

interface RhPointSummaryCardsProps {
  summary: RhPointMonthlySummary | null;
  isLoading: boolean;
  hasError: boolean;
  error: Error | null;
}

const CARD_CONFIG = [
  {
    title: "Horas trabalhadas",
    getValue: (summary: RhPointMonthlySummary) =>
      formatRhDuration(summary.total_worked_minutes),
  },
  {
    title: "Saldo do mês",
    getValue: (summary: RhPointMonthlySummary) =>
      formatRhDuration(summary.balance_minutes, { showPositiveSign: true }),
  },
  {
    title: "Horas extras",
    getValue: (summary: RhPointMonthlySummary) =>
      formatRhDuration(summary.overtime_minutes, { showPositiveSign: true }),
  },
  {
    title: "Ajustes pendentes",
    getValue: (summary: RhPointMonthlySummary) => String(summary.pending_adjustments),
  },
];

function getSummaryErrorMessage(error: Error | null) {
  if (isAxiosError(error)) {
    const responseMessage = error.response?.data?.error;

    if (
      error.response?.status === 404 &&
      typeof responseMessage === "string" &&
      responseMessage.includes("Configuracao de ponto nao encontrada")
    ) {
      return "Cadastre a configuração de ponto para visualizar o resumo.";
    }
  }

  return "Resumo indisponível no momento.";
}

export function RhPointSummaryCards({
  summary,
  isLoading,
  hasError,
  error,
}: RhPointSummaryCardsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {CARD_CONFIG.map((card) => (
        <div
          key={card.title}
          className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800"
        >
          <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{card.title}</p>
          <div className="mt-3 rounded-lg border border-dashed border-gray-300 px-4 py-5 text-sm font-medium text-gray-700 dark:border-gray-700 dark:text-gray-200">
            {isLoading
              ? "Carregando resumo..."
              : hasError
                ? getSummaryErrorMessage(error)
                : summary
                  ? card.getValue(summary)
                  : "Sem resumo disponível."}
          </div>
        </div>
      ))}
    </div>
  );
}
