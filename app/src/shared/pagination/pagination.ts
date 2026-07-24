export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export function normalizePaginatedResult<T>(
  value: T[] | PaginatedResult<T>,
  fallback: { page: number; limit: number },
): PaginatedResult<T> {
  if (Array.isArray(value)) {
    return {
      data: value,
      total: value.length,
      page: fallback.page,
      limit: fallback.limit,
      hasMore: false,
    };
  }

  return value;
}

export function getLastPage(total: number, limit: number): number {
  return Math.max(1, Math.ceil(total / limit));
}

export function getPaginationRange(
  page: number,
  limit: number,
  count: number,
): { start: number; end: number } {
  if (count === 0) {
    return { start: 0, end: 0 };
  }

  return {
    start: (page - 1) * limit + 1,
    end: (page - 1) * limit + count,
  };
}
