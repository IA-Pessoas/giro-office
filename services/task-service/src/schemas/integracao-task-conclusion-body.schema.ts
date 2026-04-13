import { zNonEmptyText } from "@workspace/shared";
import { z } from "zod";

import {
  INTEGRACAO_TASK_STATUS_VALUES,
  type IntegracaoTaskStatus,
} from "../constants/integracao-task.js";

const integracaoTaskStatusZod = z.enum(
  INTEGRACAO_TASK_STATUS_VALUES as unknown as [IntegracaoTaskStatus, ...IntegracaoTaskStatus[]],
);

const optionalDateOrNull = z.union([z.string(), z.date(), z.null()]).optional();

export const integracaoTaskConclusionBodySchema = z
  .object({
    task_id: zNonEmptyText("task_id"),
    status: integracaoTaskStatusZod,
    prevision_date: optionalDateOrNull,
    end_date: optionalDateOrNull,
    responsible_id: zNonEmptyText("responsible_id"),
    responsible2_id: z.union([z.string(), z.null()]).optional(),
    responsible3_id: z.union([z.string(), z.null()]).optional(),
    observations: z.string().optional().default(""),
    justification: z.string().optional().default(""),
  })
  .strict();

export type IntegracaoTaskConclusionBody = z.infer<typeof integracaoTaskConclusionBodySchema>;
