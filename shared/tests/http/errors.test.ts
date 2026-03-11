import assert from "node:assert/strict";
import test from "node:test";

import { ServiceError, serializeError } from "../../src/http/errors.js";

test("serializeError preserves service errors", () => {
  const result = serializeError(new ServiceError(401, "Não autenticado."), {
    requestId: "req-1",
    fallbackMessage: "Erro interno.",
  });

  assert.deepEqual(result, {
    statusCode: 401,
    body: {
      success: false,
      error: "Não autenticado.",
      code: "UNAUTHORIZED",
      requestId: "req-1",
    },
  });
});

test("ServiceError preserves native cause", () => {
  const cause = new Error("boom");
  const error = new ServiceError(502, "Erro ao comunicar com o serviço upstream.", cause);

  assert.equal(error.cause, cause);
  assert.equal(error.code, "BAD_GATEWAY");
});

test("ServiceError derives code and default message from the status code", () => {
  const error = new ServiceError(404);

  assert.equal(error.code, "NOT_FOUND");
  assert.equal(error.message, "Not Found");
});

test("ServiceError validates status code", () => {
  assert.throws(
    () => new ServiceError(200, "ok"),
    /statusCode must be an integer between 400 and 599/,
  );
});

test("serializeError normalizes unknown errors", () => {
  const result = serializeError(new Error("boom"), {
    requestId: "req-2",
    fallbackMessage: "Erro interno no gateway.",
  });

  assert.deepEqual(result, {
    statusCode: 500,
    body: {
      success: false,
      error: "Erro interno no gateway.",
      code: "INTERNAL_ERROR",
      requestId: "req-2",
    },
  });
});
