import { z } from "zod";

import { reportDefinitionSchema } from "./reportDefinition.schemas.js";

export const MAX_PREVIEW_ROWS = 100;
export const pageSchema = z.coerce.number().int().min(1);
export const pageSizeSchema = z.coerce.number().int().min(1).max(MAX_PREVIEW_ROWS);

export const reportPreviewQuerySchema = z
  .object({
    page: pageSchema.default(1),
    page_size: pageSizeSchema.default(MAX_PREVIEW_ROWS),
  })
  .strict();

export const reportPreviewRequestSchema = z
  .object({
    definition: reportDefinitionSchema,
    parameterValues: z.record(z.unknown()).optional(),
  })
  .strict();

export type ReportPreviewQuery = z.infer<typeof reportPreviewQuerySchema>;
