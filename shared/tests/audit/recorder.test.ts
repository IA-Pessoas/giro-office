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

test("createAuditRecorder nao repete erros HTTP permanentes", async () => {
  let attempts = 0;
  const logger = createLogger();
  const recorder = createAuditRecorder({
    enabled: true,
    serviceUrl: "http://audit-service:3020",
    serviceToken: "test-token",
    logger,
    retryMaxAttempts: 6,
    sleep: async () => {
      assert.fail("erro 4xx permanente nao deve aguardar retry");
    },
    fetchImpl: async () => {
      attempts += 1;
      return new Response(null, { status: 422 });
    },
  });

  await recorder(createPayload());

  assert.equal(attempts, 1);
  assert.equal(
    logger.entries.some(
      (entry) => entry.event === "audit.ingest.discarded" && entry.reason === "non_retryable",
    ),
    true,
  );
});

test("createAuditRecorder aplica jitter ao backoff", async () => {
  const delays: number[] = [];
  const recorder = createAuditRecorder({
    enabled: true,
    serviceUrl: "http://audit-service:3020",
    serviceToken: "test-token",
    logger: createLogger(),
    retryMaxAttempts: 2,
    retryBaseDelayMs: 1_000,
    random: () => 0,
    sleep: async (delayMs) => {
      delays.push(delayMs);
    },
    fetchImpl: async () => new Response(null, { status: 503 }),
  });

  await recorder(createPayload());

  assert.deepEqual(delays, [500]);
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
    random: () => 0.5,
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

test("retry publico preserva capacidade protegida e a auditoria obrigatoria falha sem retry", async () => {
  let releaseRetry!: () => void;
  let retryStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    retryStarted = resolve;
  });
  const held = new Promise<void>((resolve) => {
    releaseRetry = resolve;
  });
  const attempts = new Map<string, number>();
  const recorder = createAuditRecorder({
    enabled: true,
    serviceUrl: "http://audit-service:3020",
    serviceToken: "test-token",
    logger: createLogger(),
    maxInFlight: 2,
    protectedCapacity: 1,
    maxPending: 1,
    retryMaxAttempts: 2,
    sleep: async () => {
      retryStarted();
      await held;
    },
    fetchImpl: async (_input, init) => {
      const id = JSON.parse(String(init?.body)).requestId as string;
      const count = (attempts.get(id) ?? 0) + 1;
      attempts.set(id, count);
      return new Response(null, { status: id === "public" && count === 2 ? 204 : 503 });
    },
  });
  const publicRecord = recorder(createPayload("public"));
  try {
    await started;
    assert.equal(recorder.reserve("public"), undefined);
    const protectedSlot = recorder.reserve("protected");
    assert.equal(protectedSlot, "protected");
    await assert.rejects(recorder.recordRequired(createPayload("required"), protectedSlot), {
      message: "Audit persistence unavailable",
    });
    assert.equal(attempts.get("required"), 1);
    const releasedSlot = recorder.reserve("protected");
    assert.equal(releasedSlot, "protected");
    await assert.rejects(recorder.recordRequired(createPayload("required-again"), releasedSlot));
  } finally {
    releaseRetry();
    await publicRecord;
  }
  assert.equal(attempts.get("public"), 2);
  const publicSlot = recorder.reserve("public");
  assert.equal(publicSlot, "public");
  await assert.rejects(recorder.recordRequired(createPayload("cleanup"), publicSlot));
});

test("buffer cheio libera a reserva publica rejeitada", async () => {
  let release!: () => void;
  const held = new Promise<Response>((resolve) => {
    release = () => resolve(new Response(null, { status: 204 }));
  });
  const recorder = createAuditRecorder({
    enabled: true,
    serviceUrl: "http://audit-service:3020",
    serviceToken: "test-token",
    logger: createLogger(),
    maxInFlight: 3,
    protectedCapacity: 1,
    maxPending: 1,
    fetchImpl: async () => held,
  });
  const first = recorder(createPayload("first"));
  try {
    const rejected = recorder.reserve("public");
    assert.equal(rejected, "public");
    await recorder(createPayload("discarded"), rejected);
    const next = recorder.reserve("public");
    assert.equal(next, "public");
    await recorder(createPayload("discarded-again"), next);
  } finally {
    release();
    await first;
  }
});
