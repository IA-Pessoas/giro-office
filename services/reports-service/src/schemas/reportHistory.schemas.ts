import { z } from "zod";

export const reportHistoryQuerySchema = z
  .object({
    cursor: z.coerce.number().int().min(0).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export const deleteReportJobSchema = z
  .object({
    justification: z.string().trim().min(1).max(500),
  })
  .strict();
