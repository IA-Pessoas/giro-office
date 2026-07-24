import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

import { getPaginationRange } from "../../pagination/pagination";

interface PaginationControlsProps {
  page: number;
  limit: number;
  total: number;
  count: number;
  hasMore: boolean;
  isFetching: boolean;
  onPrevious: () => void;
  onNext: () => void;
}

const buttonClassName =
  "inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700";

export function PaginationControls({
  page,
  limit,
  total,
  count,
  hasMore,
  isFetching,
  onPrevious,
  onNext,
}: PaginationControlsProps) {
  const range = getPaginationRange(page, limit, count);

  return (
    <div className="flex flex-col gap-3 border-t border-gray-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-gray-700">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Exibindo {range.start}–{range.end} de {total}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={buttonClassName}
          disabled={page <= 1 || isFetching}
          onClick={onPrevious}
        >
          <ChevronLeft className="h-4 w-4" />
          Anterior
        </button>
        <button
          type="button"
          className={buttonClassName}
          disabled={!hasMore || isFetching}
          onClick={onNext}
        >
          {isFetching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
          Próxima
        </button>
      </div>
    </div>
  );
}
