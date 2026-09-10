import { z } from "zod";

import { TASK_ASSIGNMENT_FILTER_VALUES } from "../constants/integracaoTask.js";

export { TASK_ASSIGNMENT_FILTER_VALUES } from "../constants/integracaoTask.js";

export const taskListQuerySchema = z
  .object({
    status: z.string().default("Todos"),
    ref: z.string().default(""),
    ref_id: z.string().default(""),
    search: z.string().trim().default(""),
    client_id: z.string().uuid({ message: "client_id inválido." }).optional(),
    assignment: z
      .enum(TASK_ASSIGNMENT_FILTER_VALUES, { message: "assignment inválido." })
      .optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
