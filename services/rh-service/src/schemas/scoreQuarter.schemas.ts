import { zNonEmptyText } from "@workspace/shared";
import { z } from "zod";

export const generateQuarterBodySchema = z
  .object({
    target_user_id: zNonEmptyText("target_user_id"),
    quarter: zNonEmptyText("quarter"),
  })
  .strict();

export const updateNitroBodySchema = z
  .object({
    score_id: zNonEmptyText("score_id"),
    type: z.enum(["projects", "hours", "errors", "folders"]),
    value: z.number(),
  })
  .strict();

export const scoreQuarterIdParamSchema = z
  .object({
    id: zNonEmptyText("id"),
  })
  .strict();
