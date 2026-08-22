import assert from "node:assert/strict";
import test from "node:test";
import { createAuditRecorder } from "../../src/audit/recorder.js";
import type { CreateAuditRequestPayload } from "../../src/audit/types.js";
import type { Logger } from "../../src/logger/index.js";

function createPayload(id = "request-1"): CreateAuditRequestPayload {
  return {
    requestId: id,
    method: "GET",
    path: "/health",
    outcome: "success",
    serviceSource: "test",
    createdAt: "2026-08-22T00:00:00.000Z",
  };
}

function createLogger(): Logger & { entries: Array<Record<string, unknown>> } {
  const entries: Array<Record<string, unknown>> = [];
  return {
    entries,
    debug: (entry) => entries.push(entry),
    info: (entry) => entries.push(entry),
    warn: (entry) => entries.push(entry),
    error: (entry) => entries.push(entry),
    fatal: (entry) => entries.push(entry),
    trace: (entry) => entries.push(entry),
    silent: () => undefined,
    level: "info",
  } as unknown as Logger & { entries: Array<Record<string, unknown>> };
}

test("createAuditRecorder repete falhas HTTP transitorias ate entregar", async () => {
  let attempts = 0;
  const logger = createLogger();
  const recorder = createAuditRecorder({
    enabled: true,
    serviceUrl: "http://audit-service:3020",
    serviceToken: "test-token",
    logger,
    retryMaxAttempts: 3,
    retryBaseDelayMs: 1,
    sleep: async () => {},
    fetchImpl: async () => {
      attempts += 1;
      return new Response(null, { status: attempts === 3 ? 204 : 503 });
    },
  });

  await recorder(createPayload());

  assert.equal(attempts, 3);
  assert.equal(
    logger.entries.some((entry) => entry.event === "audit.ingest.discarded"),
    false,
  );
});

test("createAuditRecorder registra descarte definitivo como error", async () => {
  const logger = createLogger();
  const recorder = createAuditRecorder({
    enabled: true,
    serviceUrl: "http://audit-service:3020",
    serviceToken: "test-token",
    logger,
    retryMaxAttempts: 2,
    retryBaseDelayMs: 1,
    sleep: async () => {},
    fetchImpl: async () => {
      throw new Error("network unavailable");
    },
  });

  await recorder(createPayload());

  assert.equal(
    logger.entries.some(
      (entry) => entry.event === "audit.ingest.discarded" && entry.attempts === 2,
    ),
    true,
  );
});

test("createAuditRecorder cobre uma indisponibilidade de aproximadamente dez segundos", async () => {
  let attempts = 0;
  const logger = createLogger();
  const delays: number[] = [];
  const recorder = createAuditRecorder({
    enabled: true,
    serviceUrl: "http://audit-service:3020",
    serviceToken: "test-token",
    logger,
    sleep: async (delayMs) => {
      delays.push(delayMs);
    },
    fetchImpl: async () => {
      attempts += 1;
      return new Response(null, { status: attempts === 6 ? 204 : 503 });
    },
  });

  await recorder(createPayload());

  assert.equal(attempts, 6);
  assert.deepEqual(delays, [500, 1_000, 2_000, 4_000, 8_000]);
});

test("createAuditRecorder limita entregas pendentes", async () => {
  let releaseFirst: (() => void) | undefined;
  const logger = createLogger();
  const fetchImpl = () =>
    new Promise<Response>((resolve) => {
      releaseFirst = () => resolve(new Response(null, { status: 204 }));
    });
  const recorder = createAuditRecorder({
    enabled: true,
    serviceUrl: "http://audit-service:3020",
    serviceToken: "test-token",
    logger,
    maxPending: 1,
    fetchImpl,
  });

  const first = recorder(createPayload("request-1"));
  await recorder(createPayload("request-2"));

  assert.equal(
    logger.entries.some(
      (entry) => entry.event === "audit.ingest.discarded" && entry.reason === "buffer_full",
    ),
    true,
  );
  releaseFirst?.();
  await first;
});
