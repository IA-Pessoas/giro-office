import { zNonEmptyText } from "@workspace/shared";
import { z } from "zod";

export const comercialTaskUpdateBodySchema = z
  .object({
    task_id: zNonEmptyText("task_id"),
    hiring_status: zNonEmptyText("hiring_status").optional(),
    payment: z.string().optional(),
    billing_description: z.string().optional(),
  })
  .strict();

export type ComercialTaskUpdateBody = z.infer<typeof comercialTaskUpdateBodySchema>;
