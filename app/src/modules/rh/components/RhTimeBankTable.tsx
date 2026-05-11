import { CheckCircle2 } from "lucide-react";

import type { RhTimeBankRelease } from "../types";

interface RhTimeBankTableProps {
  releases: RhTimeBankRelease[];
  getUserLabel: (userId: string) => string;
  canManageTimeBank: boolean;
  approvingReleaseId: string | null;
  onApprove: (release: RhTimeBankRelease) => void;
}

const ACTION_BUTTON_CLASSNAME =
  "inline-flex h-8 min-w-[96px] items-center justify-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60";

function formatDate(date: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(date));
}

function formatMinutes(minutes: number) {
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

export function RhTimeBankTable({
  releases,
  getUserLabel,
  canManageTimeBank,
  approvingReleaseId,
  onApprove,
}: RhTimeBankTableProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
      <table className="w-full table-fixed divide-y divide-gray-200 dark:divide-gray-700">
        <thead className="bg-gray-50 dark:bg-gray-700/50">
          <tr>
            <th className="w-[16%] px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-700 dark:text-gray-300">
              Data
            </th>
            <th className="w-[18%] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-700 dark:text-gray-300">
              Colaborador
            </th>
            <th className="w-[12%] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-700 dark:text-gray-300">
              Minutos
            </th>
            <th className="w-[30%] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-700 dark:text-gray-300">
              Motivo
            </th>
            <th className="w-[12%] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-700 dark:text-gray-300">
              Status
            </th>
            <th className="w-[12%] px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-700 dark:text-gray-300">
              Acoes
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
          {releases.map((release) => {
            const isApproving = approvingReleaseId === release.id;

            return (
              <tr
                key={release.id}
                className="align-top hover:bg-gray-50 dark:hover:bg-gray-700/30"
              >
                <td className="px-5 py-3 text-sm font-medium text-gray-900 dark:text-white">
                  {formatDate(release.date)}
                </td>
                <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                  {getUserLabel(release.user_id)}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`text-sm font-semibold ${
                      release.minutes > 0
                        ? "text-green-700 dark:text-green-300"
                        : "text-red-700 dark:text-red-300"
                    }`}
                  >
                    {formatMinutes(release.minutes)}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm leading-6 text-gray-700 dark:text-gray-300">
                  {release.reason}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex min-h-7 items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                      release.is_approved
                        ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                        : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300"
                    }`}
                  >
                    {release.is_approved ? "Aprovado" : "Pendente"}
                  </span>
                </td>
                <td className="px-5 py-3 text-right">
                  {canManageTimeBank && !release.is_approved ? (
                    <button
                      type="button"
                      onClick={() => onApprove(release)}
                      disabled={isApproving}
                      className={`${ACTION_BUTTON_CLASSNAME} border-blue-200 text-blue-700 hover:bg-blue-50 dark:border-blue-900/40 dark:text-blue-300 dark:hover:bg-blue-900/20`}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {isApproving ? "Aprovando" : "Aprovar"}
                    </button>
                  ) : (
                    <span className="text-xs font-medium text-gray-400 dark:text-gray-500">
                      {release.is_approved ? "Concluido" : "Sem permissao"}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
