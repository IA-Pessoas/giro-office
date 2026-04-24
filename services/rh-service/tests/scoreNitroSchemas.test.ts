import { parseWithZod, ServiceError } from "@workspace/shared";
import { expect, it } from "vitest";

import { updateScoreNitroBodySchema } from "../src/schemas/scoreNitro.schemas.js";

const scoreUuid = "550e8400-e29b-41d4-a716-446655440099";

it("updateScoreNitroBodySchema aceita payload válido", () => {
  const parsed = parseWithZod(updateScoreNitroBodySchema, {
    score_id: scoreUuid,
    type: "projects",
    value: 1.25,
  });
  expect(parsed.score_id).toBe(scoreUuid);
  expect(parsed.type).toBe("projects");
  expect(parsed.value).toBe(1.25);
});

it("updateScoreNitroBodySchema aceita os quatro tipos de métrica", () => {
  for (const type of ["projects", "hours", "errors", "folders"] as const) {
    const parsed = parseWithZod(updateScoreNitroBodySchema, {
      score_id: scoreUuid,
      type,
      value: 2,
    });
    expect(parsed.type).toBe(type);
  }
});

it("updateScoreNitroBodySchema rejeita chaves extras (strict)", () => {
  expect(() =>
    parseWithZod(updateScoreNitroBodySchema, {
      score_id: scoreUuid,
      type: "hours",
      value: 0,
      extra: true,
    }),
  ).toThrow(ServiceError);
});

it("updateScoreNitroBodySchema rejeita score_id que não é UUID", () => {
  expect(() =>
    parseWithZod(updateScoreNitroBodySchema, {
      score_id: "not-a-uuid",
      type: "folders",
      value: 1,
    }),
  ).toThrow(ServiceError);
});

it("updateScoreNitroBodySchema rejeita type inválido", () => {
  expect(() =>
    parseWithZod(updateScoreNitroBodySchema, {
      score_id: scoreUuid,
      type: "invalid",
      value: 1,
    }),
  ).toThrow(ServiceError);
});
