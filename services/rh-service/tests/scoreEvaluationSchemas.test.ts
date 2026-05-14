import { parseWithZod, ServiceError } from "@workspace/shared";
import { expect, it } from "vitest";

import { submitScoreEvaluationBodySchema } from "../src/schemas/scoreEvaluation.schemas.js";

const sampleEvalId = "550e8400-e29b-41d4-a716-446655440000";

it("submitScoreEvaluationBodySchema rejeita evaluation_id que não é UUID", () => {
  expect(() =>
    parseWithZod(submitScoreEvaluationBodySchema, {
      evaluation_id: "not-a-uuid",
      answers: [{ question_id: "q1", answer: 5 }],
    }),
  ).toThrow(ServiceError);
});

it("submitScoreEvaluationBodySchema aceita respostas válidas", () => {
  const parsed = parseWithZod(submitScoreEvaluationBodySchema, {
    evaluation_id: sampleEvalId,
    answers: [{ question_id: "q1", answer: 8, obs: "ok" }],
  });
  expect(parsed.evaluation_id).toBe(sampleEvalId);
  expect(parsed.answers.length).toBe(1);
  expect(parsed.answers[0]?.answer).toBe(8);
});

it("submitScoreEvaluationBodySchema aceita answers vazio", () => {
  const parsed = parseWithZod(submitScoreEvaluationBodySchema, {
    evaluation_id: sampleEvalId,
    answers: [],
  });
  expect(parsed.answers.length).toBe(0);
});
