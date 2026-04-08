import { zNonEmptyText } from "@workspace/shared";
import { z } from "zod";

export const comercialTaskUpdateBodySchema = z
  .object({
    task_id: zNonEmptyText("task_id"),
    hiring_status: zNonEmptyText("hiring_status"),
    payment: z.string(),
    billing_description: z.string(),
  })
  .strict();

export type ComercialTaskUpdateBody = z.infer<typeof comercialTaskUpdateBodySchema>;
