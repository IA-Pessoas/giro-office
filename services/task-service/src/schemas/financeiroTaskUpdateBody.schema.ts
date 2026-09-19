import { zNonEmptyText } from "@workspace/shared";
import { z } from "zod";

export const financeiroTaskUpdateBodySchema = z
  .object({
    task_id: zNonEmptyText("task_id"),
  })
  .strict();

export type FinanceiroTaskUpdateBody = z.infer<typeof financeiroTaskUpdateBodySchema>;

export const financeiroSettlementBodySchema = z
  .object({
    task_ids: z.array(zNonEmptyText("task_ids")).min(1),
  })
  .strict();

export const financeiroExpressBodySchema = z
  .object({
    client_id: zNonEmptyText("client_id"),
  })
  .strict();

export const financeiroCollectorsBodySchema = z
  .object({
    department_id: zNonEmptyText("department_id"),
    collector_ids: z.array(zNonEmptyText("collector_ids")),
  })
  .strict();

export const financeiroQueueQuerySchema = z
  .object({
    department_id: zNonEmptyText("department_id").optional(),
    client_id: zNonEmptyText("client_id").optional(),
  })
  .strict();

export const financeiroCollectorsQuerySchema = z
  .object({
    department_id: zNonEmptyText("department_id"),
  })
  .strict();
