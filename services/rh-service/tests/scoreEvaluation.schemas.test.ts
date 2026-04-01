import assert from "node:assert/strict";
import test from "node:test";

import { parseWithZod, ServiceError } from "@workspace/shared";

import { submitScoreEvaluationBodySchema } from "../src/schemas/scoreEvaluation.schemas.js";

const sampleEvalId = "550e8400-e29b-41d4-a716-446655440000";

test("submitScoreEvaluationBodySchema rejeita evaluation_id que não é UUID", () => {
  assert.throws(
    () =>
      parseWithZod(submitScoreEvaluationBodySchema, {
        evaluation_id: "not-a-uuid",
        answers: [{ question_id: "q1", answer: 5 }],
      }),
    (err: unknown) => err instanceof ServiceError && err.statusCode === 400,
  );
});

test("submitScoreEvaluationBodySchema aceita respostas válidas", () => {
  const parsed = parseWithZod(submitScoreEvaluationBodySchema, {
    evaluation_id: sampleEvalId,
    answers: [{ question_id: "q1", answer: 8, obs: "ok" }],
  });
  assert.equal(parsed.evaluation_id, sampleEvalId);
  assert.equal(parsed.answers.length, 1);
  assert.equal(parsed.answers[0]?.answer, 8);
});

test("submitScoreEvaluationBodySchema aceita answers vazio", () => {
  const parsed = parseWithZod(submitScoreEvaluationBodySchema, {
    evaluation_id: sampleEvalId,
    answers: [],
  });
  assert.equal(parsed.answers.length, 0);
});
