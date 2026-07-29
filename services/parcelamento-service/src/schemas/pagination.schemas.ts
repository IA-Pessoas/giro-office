import { z } from "zod";

export const paginationQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    page_size: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict();

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export function getPaginationParams(query: PaginationQuery): {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
} {
  const page = query.page ?? 1;
  const pageSize = query.page_size ?? 50;
  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize,
  };
}

export function createPage<T>(input: {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}): {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  has_more: boolean;
} {
  return {
    items: input.items,
    total: input.total,
    page: input.page,
    page_size: input.pageSize,
    has_more: input.page * input.pageSize < input.total,
  };
}
