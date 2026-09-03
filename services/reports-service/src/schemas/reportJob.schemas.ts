import { z } from "zod";

import { REPORT_LIFECYCLE_STATUSES } from "../services/reportLifecycleService.js";
import { reportDefinitionSchema } from "./reportDefinition.schemas.js";

export const reportJobStatusSchema = z.enum(REPORT_LIFECYCLE_STATUSES);

export const createReportJobSchema = z
  .object({
    definition: reportDefinitionSchema.optional(),
    modelVersionId: z.string().uuid().optional(),
    parameterValues: z.record(z.string(), z.unknown()).optional(),
    format: z.enum(["json", "csv"]).default("json"),
  })
  .strict()
  .refine((value) => Boolean(value.definition) !== Boolean(value.modelVersionId), {
    message: "Informe definition ou modelVersionId, mas não ambos.",
  });

export const reportJobIdParamsSchema = z.object({ id: z.string().uuid() }).strict();

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
