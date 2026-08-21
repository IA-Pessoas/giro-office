import { z } from "zod";

import { reportDefinitionSchema } from "./reportDefinition.schemas.js";

export const reportJobStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
  "expired",
]);

export const createReportJobSchema = z
  .object({
    definition: reportDefinitionSchema,
    format: z.enum(["json", "csv"]),
  })
  .strict();

export const reportJobSchema = z
  .object({
    id: z.string().uuid(),
    organization_id: z.string().uuid(),
    requester_id: z.string().uuid(),
    status: reportJobStatusSchema,
    requested_at: z.coerce.date(),
  })
  .strict();

export type CreateReportJob = z.infer<typeof createReportJobSchema>;
