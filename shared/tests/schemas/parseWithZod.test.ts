import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";

import { ServiceError } from "../../src/http/errors.js";
import { parseWithZod, zodIssueMessage } from "../../src/schemas/parseWithZod.js";

function messageFor(schema: z.ZodTypeAny, data: unknown): string {
  try {
    parseWithZod(schema, data);
  } catch (error) {
    assert.ok(error instanceof ServiceError);
    assert.equal(error.statusCode, 400);
    return error.message;
  }
  assert.fail("parseWithZod deveria rejeitar os dados.");
}

test("Zod default messages do not reach the user", () => {
  const schema = z.object({ name: z.string() }).strict();

  assert.equal(
    messageFor(schema, { name: "a", file: "x" }),
    "Dados inválidos: campo não permitido (file).",
  );
  assert.equal(messageFor(schema, {}), "Dados inválidos: campo name.");
  assert.equal(messageFor(schema, { name: 1 }), "Dados inválidos: campo name.");
});

test("custom schema messages are business messages and pass through", () => {
  const schema = z.object({
    name: z.string({ required_error: "Informe o nome." }).min(3, "Nome muito curto."),
  });

  assert.equal(messageFor(schema, {}), "Informe o nome.");
  assert.equal(messageFor(schema, { name: "ab" }), "Nome muito curto.");
});

test("zodIssueMessage falls back without issues", () => {
  assert.equal(zodIssueMessage(new z.ZodError([])), "Dados inválidos.");
});
