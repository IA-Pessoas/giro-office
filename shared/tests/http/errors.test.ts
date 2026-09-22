import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { ServiceError, serializeError } from "../../src/http/errors.js";

test("errors module does not depend on node:http", async () => {
  const source = await readFile(new URL("../../src/http/errors.ts", import.meta.url), "utf8");

  assert.doesNotMatch(source, /(?:from\s+|require\(\s*)["']node:http["']/);
});

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

test("ServiceError preserves Node-compatible metadata for less common client errors", () => {
  assert.deepEqual(
    [405, 411, 413].map((statusCode) => {
      const error = new ServiceError(statusCode);
      return { code: error.code, message: error.message };
    }),
    [
      { code: "METHOD_NOT_ALLOWED", message: "Method Not Allowed" },
      { code: "LENGTH_REQUIRED", message: "Length Required" },
      { code: "PAYLOAD_TOO_LARGE", message: "Payload Too Large" },
    ],
  );
});

test("ServiceError falls back for a status absent from Node STATUS_CODES", () => {
  const error = new ServiceError(499);

  assert.equal(error.code, "HTTP_499_ERROR");
  assert.equal(error.message, "HTTP 499 Error");
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
