import { MAX_REPORTING_QUERY_ROWS } from "@workspace/shared";
import { z } from "zod";

export const MAX_SNAPSHOT_ROWS = MAX_REPORTING_QUERY_ROWS;
export const MAX_SNAPSHOT_BYTES = 20 * 1024 * 1024;

export const reportSnapshotSchema = z
  .object({
    id: z.string().uuid(),
    organization_id: z.string().uuid(),
    job_id: z.string().uuid(),
    row_count: z.number().int().min(0).max(MAX_SNAPSHOT_ROWS),
    byte_size: z.number().int().min(0).max(MAX_SNAPSHOT_BYTES),
    created_at: z.coerce.date(),
  })
  .strict();

export const reportSnapshotRowSchema = z
  .object({
    snapshot_id: z.string().uuid(),
    row_number: z.number().int().min(1).max(MAX_SNAPSHOT_ROWS),
    values: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])),
  })
  .strict();

export type ReportSnapshot = z.infer<typeof reportSnapshotSchema>;
