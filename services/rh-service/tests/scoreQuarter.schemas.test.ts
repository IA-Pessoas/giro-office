import { parseWithZod, ServiceError } from "@workspace/shared";
import { expect, it } from "vitest";

import {
  generateQuarterBodySchema,
  scoreQuarterIdParamSchema,
  updateNitroBodySchema,
} from "../src/schemas/scoreQuarter.schemas.js";

it("generateQuarterBodySchema aceita payload válido", () => {
  const parsed = parseWithZod(generateQuarterBodySchema, {
    target_user_id: "user-1",
    quarter: "2026-Q1",
  });
  expect(parsed.target_user_id).toBe("user-1");
  expect(parsed.quarter).toBe("2026-Q1");
});

it("generateQuarterBodySchema rejeita chaves extras (strict)", () => {
  let caught: unknown;
  try {
    parseWithZod(generateQuarterBodySchema, {
      target_user_id: "user-1",
      quarter: "2026-Q1",
      extra: true,
    });
  } catch (e) {
    caught = e;
  }
  expect(caught).toBeDefined();
  expect(caught).toBeInstanceOf(ServiceError);
  expect((caught as ServiceError).statusCode).toBe(400);
});

it("updateNitroBodySchema aceita os quatro tipos de métrica", () => {
  for (const type of ["projects", "hours", "errors", "folders"] as const) {
    const parsed = parseWithZod(updateNitroBodySchema, {
      score_id: "score-1",
      type,
      value: 1.5,
    });
    expect(parsed.type).toBe(type);
  }
});

it("updateNitroBodySchema rejeita tipo inválido", () => {
  expect(() =>
    parseWithZod(updateNitroBodySchema, {
      score_id: "score-1",
      type: "invalid",
      value: 1,
    }),
  ).toThrow(ServiceError);
});

it("scoreQuarterIdParamSchema valida id", () => {
  const parsed = parseWithZod(scoreQuarterIdParamSchema, { id: "score-uuid-1" });
  expect(parsed.id).toBe("score-uuid-1");
});
