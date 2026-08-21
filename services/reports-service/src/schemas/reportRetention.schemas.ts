import { z } from "zod";

export const DEFAULT_REPORT_RETENTION_DAYS = 30;
export const MAX_REPORT_RETENTION_DAYS = 365;

export const reportRetentionPolicySchema = z
  .object({
    organization_id: z.string().uuid(),
    retention_days: z.number().int().min(1).max(MAX_REPORT_RETENTION_DAYS),
  })
  .strict();

export type ReportRetentionPolicy = z.infer<typeof reportRetentionPolicySchema>;
