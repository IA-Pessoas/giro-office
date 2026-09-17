import { zNonEmptyText } from "@workspace/shared";
import { z } from "zod";

export const taskIntegrationRegularizeBodySchema = z
  .object({
    task_model_id: zNonEmptyText("task_model_id"),
    referring: zNonEmptyText("referring"),
    referring_type: z.enum(["process", "license"]),
  })
  .strict();

export const taskIntegrationRegularizeDeleteBodySchema = z
  .object({ integration_id: zNonEmptyText("integration_id") })
  .strict();

export const taskIntegrationRegularizeListQuerySchema = z
  .object({ task_model_id: zNonEmptyText("task_model_id").optional() })
  .strict();
