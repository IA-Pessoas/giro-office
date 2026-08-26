import { z } from "zod";

import { reportJobStatusSchema } from "./reportJob.schemas.js";

const reportHistoryScopeSchema = z.enum(["personal", "library"]);

export const reportJobListQuerySchema = z
  .object({
    scope: reportHistoryScopeSchema.default("personal"),
    status: reportJobStatusSchema.optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    model_id: z.string().uuid().optional(),
    author_id: z.string().uuid().optional(),
    cursor: z.coerce.number().int().min(0).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict()
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: "O início do período deve preceder o fim.",
    path: ["from"],
  });

export const reportHistoryQuerySchema = z
  .object({
    cursor: z.coerce.number().int().min(0).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export const deleteReportJobSchema = z
  .object({
    justification: z.string().trim().min(10).max(1000),
  })
  .strict();
