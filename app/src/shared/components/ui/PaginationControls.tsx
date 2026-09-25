import { useEffect, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Loader2 } from "lucide-react";

import { getPaginationRange } from "@shared/pagination/pagination";

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
  onFirst?: () => void;
  onLast?: () => void;
  onPageChange?: (page: number) => void;
}

const buttonClassName =
  "inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700";
const pageInputClassName =
  "h-6 w-8 rounded-md border border-gray-200 bg-white px-0 text-center text-xs font-medium text-gray-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200";

export function PaginationControls({
  page,
  limit,
  total,
  count,
  hasMore,
  isFetching,
  totalPages,
  onPrevious,
  onNext,
  onFirst,
  onLast,
  onPageChange,
}: PaginationControlsProps) {
  const safePage = totalPages ? Math.min(totalPages, Math.max(1, page)) : page;
  const range = getPaginationRange(safePage, limit, count);
  const canSelectPage = Boolean(totalPages && onPageChange);
  const [pageInputValue, setPageInputValue] = useState(String(safePage));

  useEffect(() => {
    setPageInputValue(String(safePage));
    if (safePage !== page && onPageChange) {
      onPageChange(safePage);
    }
  }, [onPageChange, page, safePage]);

  function submitPage(rawPage: string) {
    if (!totalPages || !onPageChange) {
      return;
    }

    const normalizedPage = rawPage.trim();

    if (!/^\d+$/.test(normalizedPage)) {
      setPageInputValue(String(safePage));
      return;
    }

    const nextPage = Number(normalizedPage);

    setPageInputValue(String(Math.min(totalPages, Math.max(1, Math.trunc(nextPage)))));
    onPageChange(Math.min(totalPages, Math.max(1, Math.trunc(nextPage))));
  }

  function handlePageChange(event: ChangeEvent<HTMLInputElement>) {
    setPageInputValue(event.currentTarget.value.replace(/\D/g, ""));
  }

  function handlePageKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    submitPage(event.currentTarget.value);
  }

  return (
    <div className="flex flex-col gap-3 border-t border-gray-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-gray-700">
      <div className="flex flex-col gap-2 text-sm text-gray-500 sm:flex-row sm:items-center sm:gap-4 dark:text-gray-400">
        <p>Mostrando {range.start} a {range.end} de {total}</p>
        {totalPages ? (
          canSelectPage ? (
            <label className="flex items-center gap-2">
              Página
              <input
                type="text"
                inputMode="numeric"
                min={1}
                max={totalPages}
                value={pageInputValue}
                disabled={isFetching}
                onChange={handlePageChange}
                onBlur={(event) => submitPage(event.currentTarget.value)}
                onKeyDown={handlePageKeyDown}
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
        {onFirst ? (
          <button
            type="button"
            className={buttonClassName}
            aria-label="Primeira página"
            title="Primeira página"
            disabled={safePage <= 1 || isFetching}
            onClick={onFirst}
          >
            <ChevronsLeft className="h-4 w-4" />
          </button>
        ) : null}
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
          disabled={!hasMore || safePage >= (totalPages ?? Number.POSITIVE_INFINITY) || isFetching}
          onClick={onNext}
        >
          {isFetching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
          Próxima
        </button>
        {onLast ? (
          <button
            type="button"
            className={buttonClassName}
            aria-label="Última página"
            title="Última página"
            disabled={!totalPages || page >= totalPages || isFetching}
            onClick={onLast}
          >
            <ChevronsRight className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
