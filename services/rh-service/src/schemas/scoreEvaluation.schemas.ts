import { zNonEmptyText } from "@workspace/shared";
import { z } from "zod";

const answerItemSchema = z
  .object({
    question_id: zNonEmptyText("question_id"),
    answer: z.number().finite(),
    obs: z.string().optional(),
  })
  .strict();

export const submitScoreEvaluationBodySchema = z
  .object({
    evaluation_id: z.string().uuid("evaluation_id deve ser um UUID válido."),
    answers: z.array(answerItemSchema),
  })
  .strict();
