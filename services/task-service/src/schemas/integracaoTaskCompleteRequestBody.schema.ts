import { zNonEmptyText } from "@workspace/shared";
import { z } from "zod";

export const integracaoTaskCompleteRequestBodySchema = z
  .object({
    task_id: zNonEmptyText("task_id"),
    request_id: zNonEmptyText("request_id").optional(),
    decision: z.enum(["approved", "refused"]).optional(),
    reason: z.string().trim().max(2000).optional(),
  })
  .strict()
  .refine((body) => body.decision !== "refused" || Boolean(body.reason), {
    message: "Motivo da recusa é obrigatório.",
    path: ["reason"],
  });

export type IntegracaoTaskCompleteRequestBody = z.infer<
  typeof integracaoTaskCompleteRequestBodySchema
>;
