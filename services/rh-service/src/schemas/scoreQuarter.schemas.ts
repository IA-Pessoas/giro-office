import { zNonEmptyText } from "@workspace/shared";
import { z } from "zod";

export const generateQuarterBodySchema = z
  .object({
    target_user_id: zNonEmptyText("target_user_id"),
    quarter: zNonEmptyText("quarter"),
  })
  .strict();

export const submitEvaluationBodySchema = z
  .object({
    evaluation_id: zNonEmptyText("evaluation_id"),
    answers: z
      .array(
        z
          .object({
            question_id: zNonEmptyText("question_id"),
            answer: z.number(),
            obs: z.string().optional(),
          })
          .strict(),
      )
      .min(1, "answers deve conter ao menos um item."),
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
