import { zNonEmptyText } from "@workspace/shared";
import { z } from "zod";

export const integracaoTaskCompletionRequestBodySchema = z
  .object({
    task_id: zNonEmptyText("task_id"),
    reason: z.string().trim().max(2000).optional().default(""),
  })
  .strict();

export const integracaoTaskCompletionRequestListQuerySchema = z
  .object({
    task_id: zNonEmptyText("task_id"),
  })
  .strict();

export const integracaoTaskReopenBodySchema = z
  .object({
    task_id: zNonEmptyText("task_id"),
    reason: zNonEmptyText("reason"),
  })
  .strict();
