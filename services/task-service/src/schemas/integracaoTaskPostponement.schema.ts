import { zNonEmptyText } from "@workspace/shared";
import { z } from "zod";

import { isIsoCalendarDate } from "../utils/civilDate.js";

const newPrevisionDateSchema = z
  .string()
  .refine(isIsoCalendarDate, "new_prevision_date deve ser uma data YYYY-MM-DD válida.");

export const integracaoTaskPostponementBodySchema = z
  .object({
    task_id: zNonEmptyText("task_id"),
    new_prevision_date: newPrevisionDateSchema,
    justification: z.string().trim().min(1, "justification é obrigatória.").max(2000),
  })
  .strict();

export const integracaoTaskPostponementListQuerySchema = z
  .object({ task_id: zNonEmptyText("task_id") })
  .strict();
