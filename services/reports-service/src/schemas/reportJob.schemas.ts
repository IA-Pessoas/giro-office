import { z } from "zod";

import { REPORT_LIFECYCLE_STATUSES } from "../services/reportLifecycleService.js";
import { reportDefinitionSchema } from "./reportDefinition.schemas.js";

export const reportJobStatusSchema = z.enum(REPORT_LIFECYCLE_STATUSES);

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
