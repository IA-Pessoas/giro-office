import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { INTERNAL_ERROR_MESSAGE, ServiceError, serializeError } from "../../src/http/errors.js";

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
      error: INTERNAL_ERROR_MESSAGE,
      code: "INTERNAL_ERROR",
      requestId: "req-2",
    },
  });
});

test("serializeError hides internal details of 5xx service errors behind a neutral message", () => {
  const originalConsoleError = console.error;
  const logged: unknown[][] = [];
  console.error = (...args: unknown[]) => logged.push(args);
  try {
    const leaks = [
      new ServiceError(500, "Erro ao criar contabil.responsibles."),
      new ServiceError(503, "Banco de dados indisponível: configure o binding HYPERDRIVE."),
      new ServiceError(502, "Audit-service respondeu 401."),
    ];

    for (const leak of leaks) {
      const result = serializeError(leak, {
        requestId: "req-3",
        fallbackMessage: "contabil-service",
      });
      assert.equal(result.statusCode, leak.statusCode);
      assert.equal(result.body.error, INTERNAL_ERROR_MESSAGE);
      assert.equal(result.body.code, leak.code);
      assert.equal(result.body.requestId, "req-3");
    }
  } finally {
    console.error = originalConsoleError;
  }

  // O motivo real continua disponível para o suporte, no log do worker.
  assert.equal(logged.length, 3);
  assert.match(String(logged[0]?.[0]), /contabil-service/);
  assert.match(JSON.stringify(logged[0]?.[1]), /req-3/);
});

test("INTERNAL_ERROR_MESSAGE names no service, env var or table", () => {
  assert.doesNotMatch(INTERNAL_ERROR_MESSAGE, /service|[A-Z]{2,}_|\w+\.\w+/);
});

test("serializeError shows a 5xx message only when the error opts in with expose", () => {
  const result = serializeError(
    new ServiceError(503, "Extração por IA indisponível no momento.", undefined, "AI_OFF", {
      expose: true,
    }),
    { requestId: "req-4", fallbackMessage: "task-service" },
  );

  assert.deepEqual(result, {
    statusCode: 503,
    body: {
      success: false,
      error: "Extração por IA indisponível no momento.",
      code: "AI_OFF",
      requestId: "req-4",
    },
  });
});
