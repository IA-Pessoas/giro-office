import {
  COMMERCIAL_TASK_BILLING_EVENT_VERSION,
  COMMERCIAL_TASK_BILLING_UPDATED_EVENT,
  COMMERCIAL_TASK_HIRING_STATUSES,
} from "@workspace/shared";
import { z } from "zod";

export const commercialTaskBillingEventSchema = z
  .object({
    event_id: z.string().uuid(),
    event_type: z.literal(COMMERCIAL_TASK_BILLING_UPDATED_EVENT),
    event_version: z.literal(COMMERCIAL_TASK_BILLING_EVENT_VERSION),
    organization_id: z.string().uuid(),
    task_id: z.string().uuid(),
    hiring_status: z.enum(COMMERCIAL_TASK_HIRING_STATUSES),
    payment: z.string().nullable(),
    billing_description: z.string().nullable(),
    audit_correlation_id: z.string().trim().min(1),
    occurred_at: z.string().datetime({ offset: true }),
  })
  .strict();
