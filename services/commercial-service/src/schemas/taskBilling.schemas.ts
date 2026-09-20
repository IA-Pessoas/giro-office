import {
  COMMERCIAL_TASK_BILLING_EVENT_VERSION,
  COMMERCIAL_TASK_BILLING_UPDATED_EVENT,
  COMMERCIAL_TASK_HIRING_STATUSES,
} from "@workspace/shared";
import { z } from "zod";

export const commercialTaskHiringStatusSchema = z.enum(COMMERCIAL_TASK_HIRING_STATUSES);

export const taskBillingIdParamSchema = z
  .object({ taskId: z.string().uuid("Tarefa inválida.") })
  .strict();

export const updateTaskBillingBodySchema = z
  .object({
    hiring_status: commercialTaskHiringStatusSchema,
    payment: z.string().trim().max(255).nullable().optional(),
    billing_description: z.string().trim().max(5000).nullable().optional(),
  })
  .strict();

export const commercialTaskBillingEventSchema = z
  .object({
    event_id: z.string().uuid(),
    event_type: z.literal(COMMERCIAL_TASK_BILLING_UPDATED_EVENT),
    event_version: z.literal(COMMERCIAL_TASK_BILLING_EVENT_VERSION),
    organization_id: z.string().uuid(),
    task_id: z.string().uuid(),
    hiring_status: commercialTaskHiringStatusSchema,
    payment: z.string().nullable(),
    billing_description: z.string().nullable(),
    audit_correlation_id: z.string().trim().min(1),
    occurred_at: z.string().datetime({ offset: true }),
  })
  .strict();

export type UpdateTaskBillingBody = z.infer<typeof updateTaskBillingBodySchema>;
export type CommercialTaskBillingEvent = z.infer<typeof commercialTaskBillingEventSchema>;
