import { zNonEmptyText } from "@workspace/shared";
import { z } from "zod";

export const financeiroTaskUpdateBodySchema = z
  .object({
    task_id: zNonEmptyText("task_id"),
  })
  .strict();

export type FinanceiroTaskUpdateBody = z.infer<typeof financeiroTaskUpdateBodySchema>;
