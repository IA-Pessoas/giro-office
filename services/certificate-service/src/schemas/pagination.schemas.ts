import { z } from "zod";

export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;

export const paginationQueryFields = {
  page: z.coerce.number().int().min(1).optional(),
  page_size: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE, `Tamanho de página deve ser no máximo ${MAX_PAGE_SIZE}.`)
    .optional(),
};

export const paginationQuerySchema = z.object(paginationQueryFields).strict();

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  has_more: boolean;
}

export function getPaginationParams(query: PaginationQuery): { skip: number; take: number } {
  const page = query.page ?? DEFAULT_PAGE;
  const take = query.page_size ?? DEFAULT_PAGE_SIZE;

  return {
    skip: (page - 1) * take,
    take,
  };
}

export function buildPaginatedResult<T>(
  items: T[],
  total: number,
  query: PaginationQuery,
): PaginatedResult<T> {
  const page = query.page ?? DEFAULT_PAGE;
  const pageSize = query.page_size ?? DEFAULT_PAGE_SIZE;

  return {
    items,
    total,
    page,
    page_size: pageSize,
    has_more: page * pageSize < total,
  };
}
