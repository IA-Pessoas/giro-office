import { zNonEmptyText } from "@workspace/shared";
import { z } from "zod";

export const scoreQuestionTypeSchema = z.enum(["behavioral", "technical", "tech", "leadership"], {
  message: "type inválido.",
});

export const createScoreQuestionBodySchema = z
  .object({
    question: zNonEmptyText("question"),
    type: scoreQuestionTypeSchema,
  })
  .strict();

export const updateScoreQuestionBodySchema = z
  .object({
    id: z.string().uuid({ message: "id inválido." }),
    question: zNonEmptyText("question").optional(),
    type: scoreQuestionTypeSchema.optional(),
    active: z.boolean().optional(),
  })
  .strict()
  .refine(
    (body) => body.question !== undefined || body.type !== undefined || body.active !== undefined,
    { message: "Informe question, type ou active para atualizar." },
  );

export const deleteScoreQuestionBodySchema = z
  .object({
    id: z.string().uuid({ message: "id inválido." }),
  })
  .strict();

export const listScoreQuestionQuerySchema = z
  .object({
    type: z
      .string()
      .optional()
      .transform((val) => {
        if (val === undefined) return undefined;
        const t = val.trim();
        if (t === "" || t === "Todos") return undefined;
        return scoreQuestionTypeSchema.parse(t);
      }),
    all: z.preprocess((val) => {
      if (val === undefined || val === null) return undefined;
      if (typeof val !== "string") return undefined;
      return val === "true" ? "true" : undefined;
    }, z.enum(["true"]).optional()),
  })
  .strict();
