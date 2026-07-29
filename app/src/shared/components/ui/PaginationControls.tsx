import type { ChangeEvent } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

interface PaginationControlsProps {
  page: number;
  limit: number;
  total: number;
  count: number;
  hasMore: boolean;
  isFetching: boolean;
  totalPages?: number;
  onPrevious: () => void;
  onNext: () => void;
  onPageChange?: (page: number) => void;
}

const buttonClassName =
  "inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700";
const pageInputClassName =
  "h-6 w-8 rounded-md border border-gray-200 bg-white px-0 text-center text-xs font-medium text-gray-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200";

export function PaginationControls({
  page,
  total,
  count,
  hasMore,
  isFetching,
  totalPages,
  onPrevious,
  onNext,
  onPageChange,
}: PaginationControlsProps) {
  const canSelectPage = Boolean(totalPages && onPageChange);

  function handlePageChange(event: ChangeEvent<HTMLInputElement>) {
    if (!totalPages || !onPageChange) {
      return;
    }

    const rawPage = event.currentTarget.value.trim();

    if (!/^\d+$/.test(rawPage)) {
      return;
    }

    const nextPage = Number(rawPage);

    onPageChange(Math.min(totalPages, Math.max(1, Math.trunc(nextPage))));
  }

  return (
    <div className="flex flex-col gap-3 border-t border-gray-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-gray-700">
      <div className="flex flex-col gap-2 text-sm text-gray-500 sm:flex-row sm:items-center sm:gap-4 dark:text-gray-400">
        <p>Exibindo {count} de {total}</p>
        {totalPages ? (
          canSelectPage ? (
            <label className="flex items-center gap-2">
              Página
              <input
                type="text"
                inputMode="numeric"
                min={1}
                max={totalPages}
                value={page}
                disabled={isFetching}
                onChange={handlePageChange}
                className={pageInputClassName}
              />
              de {totalPages}
            </label>
          ) : (
            <span>Página {page} de {totalPages}</span>
          )
        ) : null}
      </div>
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
