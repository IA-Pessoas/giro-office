import { z } from "zod";

import { reportDefinitionSchema } from "./reportDefinition.schemas.js";

export const createReportModelSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    definition: reportDefinitionSchema,
  })
  .strict();

export const reportModelSchema = z
  .object({
    id: z.string().uuid(),
    organization_id: z.string().uuid(),
    name: z.string().trim().min(1).max(120),
    version: z.number().int().positive(),
  })
  .strict();

export type CreateReportModel = z.infer<typeof createReportModelSchema>;
