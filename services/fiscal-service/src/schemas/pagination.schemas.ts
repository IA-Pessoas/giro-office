import { z } from "zod";

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  page_size: z.coerce.number().int().min(1).max(100).optional(),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const commaSeparatedListSchema = z.preprocess(
  (value) => {
    const values = Array.isArray(value) ? value : [value];

    return values
      .flatMap((item) => (typeof item === "string" ? item.split(",") : []))
      .map((item) => item.trim())
      .filter(Boolean);
  },
  z.array(z.string().min(1)).default([]),
);

export function getPaginationParams(query: PaginationQuery): { skip: number; take: number } {
  const page = query.page ?? 1;
  const take = query.page_size ?? 50;

  return {
    skip: (page - 1) * take,
    take,
  };
}
