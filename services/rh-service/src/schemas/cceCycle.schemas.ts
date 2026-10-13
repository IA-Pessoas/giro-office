import { zIsoDate, zNonEmptyText } from "@workspace/shared";
import { z } from "zod";

export const configureCceFloorsBodySchema = z
  .object({
    floor_count: z.number().int().min(0).max(4),
  })
  .strict();

export const createCceCycleBodySchema = z
  .object({
    year: z.number().int().min(1).max(9999),
    month: z.number().int().min(1).max(12),
  })
  .strict();

export const cceWeeklyEvaluationIdParamSchema = z
  .object({
    id: zNonEmptyText("id"),
  })
  .strict();

export const updateCceWeeklyEvaluationBodySchema = z
  .object({
    monitor_user_id: z.string().uuid({ message: "monitor_user_id inválido." }),
    evaluated_at: zIsoDate("evaluated_at"),
    occurrences: z
      .object({
        organization: z.boolean(),
        cleanliness: z.boolean(),
        delays: z.boolean(),
        cellphone: z.boolean(),
        conversations: z.boolean(),
        demands: z.boolean(),
        dress_code: z.boolean(),
      })
      .strict(),
  })
  .strict();
