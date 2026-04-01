import assert from "node:assert/strict";
import test from "node:test";

import { parseWithZod, ServiceError } from "@workspace/shared";

import {
  generateQuarterBodySchema,
  scoreQuarterIdParamSchema,
  updateNitroBodySchema,
} from "../src/schemas/scoreQuarter.schemas.js";

test("generateQuarterBodySchema aceita payload válido", () => {
  const parsed = parseWithZod(generateQuarterBodySchema, {
    target_user_id: "user-1",
    quarter: "2026-Q1",
  });
  assert.equal(parsed.target_user_id, "user-1");
  assert.equal(parsed.quarter, "2026-Q1");
});

test("generateQuarterBodySchema rejeita chaves extras (strict)", () => {
  assert.throws(
    () =>
      parseWithZod(generateQuarterBodySchema, {
        target_user_id: "user-1",
        quarter: "2026-Q1",
        extra: true,
      }),
    (err: unknown) => err instanceof ServiceError && err.statusCode === 400,
  );
});

test("updateNitroBodySchema aceita os quatro tipos de métrica", () => {
  for (const type of ["projects", "hours", "errors", "folders"] as const) {
    const parsed = parseWithZod(updateNitroBodySchema, {
      score_id: "score-1",
      type,
      value: 1.5,
    });
    assert.equal(parsed.type, type);
  }
});

test("updateNitroBodySchema rejeita tipo inválido", () => {
  assert.throws(
    () =>
      parseWithZod(updateNitroBodySchema, {
        score_id: "score-1",
        type: "invalid",
        value: 1,
      }),
    (err: unknown) => err instanceof ServiceError && err.statusCode === 400,
  );
});

test("scoreQuarterIdParamSchema valida id", () => {
  const parsed = parseWithZod(scoreQuarterIdParamSchema, { id: "score-uuid-1" });
  assert.equal(parsed.id, "score-uuid-1");
});
