import { zNonEmptyText } from "@workspace/shared";
import { z } from "zod";

const participantIdsSchema = z.array(z.string().uuid()).min(1).max(500);

const questionSchema = z
  .object({
    prompt: zNonEmptyText("prompt"),
    value: z.number().positive().finite(),
    answer_key: zNonEmptyText("answer_key"),
  })
  .strict();

export const createRhExamBodySchema = z
  .object({
    title: zNonEmptyText("title"),
    evaluator_id: z.string().uuid(),
    window_start: z.string().datetime({ offset: true }).optional(),
    window_end: z.string().datetime({ offset: true }).optional(),
    observations: z.string().max(5000).default(""),
    participant_ids: participantIdsSchema,
    questions: z.array(questionSchema).min(1).max(100),
  })
  .strict()
  .refine(
    (body) =>
      !body.window_start ||
      !body.window_end ||
      Date.parse(body.window_start) <= Date.parse(body.window_end),
    { message: "A data inicial deve ser anterior à data final.", path: ["window_end"] },
  )
  .refine((body) => new Set(body.participant_ids).size === body.participant_ids.length, {
    message: "Não repita participantes na prova.",
    path: ["participant_ids"],
  });

export const rhExamIdParamSchema = z.object({ id: z.string().uuid() }).strict();
