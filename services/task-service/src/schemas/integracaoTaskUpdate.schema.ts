import { zNonEmptyText } from "@workspace/shared";
import { z } from "zod";

import {
  INTEGRACAO_TASK_STATUS_VALUES,
  type IntegracaoTaskStatus,
} from "../constants/integracaoTask.js";
import { isIsoCalendarDate } from "../utils/civilDate.js";

const integracaoTaskStatusZod = z.enum(
  INTEGRACAO_TASK_STATUS_VALUES as unknown as [IntegracaoTaskStatus, ...IntegracaoTaskStatus[]],
);

const taskBillingZod = z.enum(["Realizar", "Não Realizar"]);

/**
 * PUT parcial: só `task_id` obrigatório; demais opcionais (`.strict()` rejeita chaves extras).
 */
export const integracaoTaskUpdateBodySchema = z
  .object({
    task_id: zNonEmptyText("task_id"),
    model_id: zNonEmptyText("model_id").optional(),
    name: z.string().optional(),
    status: integracaoTaskStatusZod.optional(),
    department_id: z.string().optional(),
    observations: z.string().optional(),
    billing: taskBillingZod.optional(),
    urgency: z.string().optional(),
    responsible_id: zNonEmptyText("responsible_id").nullable().optional(),
    /** Só define a primeira previsão; depois disso, alteração é via prorrogação. */
    prevision_date: z
      .string()
      .refine(isIsoCalendarDate, "prevision_date deve ser uma data YYYY-MM-DD válida.")
      .optional(),
  })
  .strict();
