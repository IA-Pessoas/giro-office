import { zNonEmptyText } from "@workspace/shared";
import { z } from "zod";

export const integracaoTaskCompleteRequestBodySchema = z
  .object({
    task_id: zNonEmptyText("task_id"),
  })
  .strict();

export type IntegracaoTaskCompleteRequestBody = z.infer<
  typeof integracaoTaskCompleteRequestBodySchema
>;
