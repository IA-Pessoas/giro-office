import { z } from "zod";

const uuidSchema = z.string().uuid("Identificador inválido.");

const pageSchema = z.preprocess(
  (value) => (value === undefined ? 1 : Number(value)),
  z.number().int().min(1),
);

const pageSizeSchema = z.preprocess(
  (value) => (value === undefined ? 20 : Number(value)),
  z.number().int().min(1).max(100),
);

export const triageCompetenceHistoryParamsSchema = z.object({
  id: uuidSchema,
});

export const listTriageCompetenceHistoryQuerySchema = z
  .object({
    page: pageSchema,
    page_size: pageSizeSchema,
  })
  .strict();
