import assert from "node:assert/strict";
import test from "node:test";

import { createAuditRecorder } from "../src/audit/recorder.js";

for (const failure of ["network", "http", "timeout"] as const) {
  test(`required audit rejects ${failure}, releases capacity and preserves best-effort`, async () => {
    let fail = true;
    const logs: unknown[] = [];
    const recorder = createAuditRecorder({
      enabled: true,
      serviceUrl: "http://audit-service:3020",
      serviceToken: "test-token",
      logger: { error: (value: unknown) => logs.push(value), warn() {} } as never,
      maxInFlight: 1,
      timeoutMs: 5,
      fetchImpl: async (_input, init) => {
        if (!fail) return new Response(null, { status: 201 });
        if (failure === "http") return new Response("private-error", { status: 500 });
        if (failure === "timeout") {
          await new Promise((_, reject) => {
            init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), {
              once: true,
            });
          });
        }
        throw new Error("private-error");
      },
    });
    assert.equal(typeof recorder.recordRequired, "function");
    const keepAlive = setTimeout(() => {}, 1_000);
    try {
      await assert.rejects(recorder.recordRequired({ requestId: "attempt-1" } as never), {
        message: "Audit persistence unavailable",
      });
      assert(!JSON.stringify(logs).includes("private-error"));
      for (const log of logs) {
        assert.equal((log as { err: Error }).err.message, "Audit persistence unavailable");
      }
      // Legacy callers must still resolve on the same failure.
      await assert.doesNotReject(recorder({ requestId: "legacy-1" } as never));
      fail = false;
      await recorder.recordRequired({ requestId: "attempt-2" } as never);
      await recorder.recordRequired({ requestId: "attempt-3" } as never);
    } finally {
      clearTimeout(keepAlive);
    }
  });
}

test("required audit rejects disabled recording while legacy recording stays a no-op", async () => {
  const recorder = createAuditRecorder({
    enabled: false,
    serviceUrl: "http://audit-service:3020",
    serviceToken: "test-token",
    logger: { error() {}, warn() {} } as never,
    fetchImpl: async () => assert.fail("disabled audit must not fetch"),
  });
  assert.equal(typeof recorder.recordRequired, "function");
  await assert.rejects(recorder.recordRequired({ requestId: "attempt" } as never));
  await assert.doesNotReject(recorder({ requestId: "legacy" } as never));
});

test("required audit waits for ACK and bounds concurrent work at capacity one", async () => {
  let release!: (response: Response) => void;
  const recorder = createAuditRecorder({
    enabled: true,
    serviceUrl: "http://audit-service:3020",
    serviceToken: "test-token",
    logger: { error() {}, warn() {} } as never,
    maxInFlight: 1,
    protectedCapacity: 1,
    fetchImpl: async () =>
      await new Promise<Response>((resolve) => {
        release = resolve;
      }),
  });
  assert.equal(typeof recorder.recordRequired, "function");
  let acknowledged = false;
  const pending = recorder.recordRequired({ requestId: "attempt-1" } as never).then(() => {
    acknowledged = true;
  });
  await Promise.resolve();
  assert.equal(acknowledged, false);
  await assert.rejects(recorder.recordRequired({ requestId: "attempt-2" } as never));
  release(new Response(null, { status: 201 }));
  await pending;
  assert.equal(acknowledged, true);
  const reservation = recorder.reserve("protected");
  assert.equal(reservation, "protected");
  const next = recorder.recordRequired({ requestId: "attempt-3" } as never, reservation);
  release(new Response(null, { status: 204 }));
  await next;
  assert.equal(recorder.reserve("protected"), "protected");
});

test("required audit releases the original public reservation classification", async () => {
  const recorder = createAuditRecorder({
    enabled: true,
    serviceUrl: "http://audit-service:3020",
    serviceToken: "test-token",
    logger: { error() {}, warn() {} } as never,
    maxInFlight: 2,
    protectedCapacity: 1,
    fetchImpl: async () => new Response(null, { status: 201 }),
  });
  const reservation = recorder.reserve("public");
  assert.equal(reservation, "public");
  await recorder.recordRequired({ requestId: "attempt" } as never, reservation);
  assert.equal(recorder.reserve("public"), "public");
});

test("createAuditRecorder bounds an unavailable audit request with a timeout", async () => {
  let capturedSignal: AbortSignal | undefined;
  const errors: unknown[] = [];
  const recorder = createAuditRecorder({
    enabled: true,
    serviceUrl: "http://audit-service:3020",
    serviceToken: "test-token",
    logger: {
      error(value: unknown) {
        errors.push(value);
      },
      warn() {},
    } as never,
    timeoutMs: 1,
    fetchImpl: async (_input, init) => {
      capturedSignal = init?.signal ?? undefined;
      await new Promise((_, reject) => {
        capturedSignal?.addEventListener("abort", () => reject(capturedSignal?.reason), {
          once: true,
        });
      });
      throw new Error("unreachable");
    },
  });

  await recorder({ requestId: "request-1" } as never);

  assert(capturedSignal instanceof AbortSignal);
  assert.equal(capturedSignal.aborted, true);
  assert.equal(errors.length, 1);
});

test("createAuditRecorder drops work when its in-flight limit is reached", async () => {
  let releaseFirst: ((response: Response) => void) | undefined;
  let fetchCalls = 0;
  const warnings: unknown[] = [];
  const recorder = createAuditRecorder({
    enabled: true,
    serviceUrl: "http://audit-service:3020",
    serviceToken: "test-token",
    logger: {
      error() {},
      warn(value: unknown) {
        warnings.push(value);
      },
    } as never,
    maxInFlight: 1,
    fetchImpl: async () => {
      fetchCalls += 1;
      return await new Promise<Response>((resolve) => {
        releaseFirst = resolve;
      });
    },
  });

  const first = recorder({ requestId: "request-1", method: "GET" } as never);
  await Promise.resolve();
  await recorder({ requestId: "request-2", method: "GET" } as never);

  assert.equal(fetchCalls, 1);
  assert.equal(warnings.length, 1);
  releaseFirst?.(new Response(null, { status: 204 }));
  await first;
});

test("createAuditRecorder reserves bounded capacity before sensitive work", async () => {
  let release: ((response: Response) => void) | undefined;
  let fetchCalls = 0;
  const recorder = createAuditRecorder({
    enabled: true,
    serviceUrl: "http://audit-service:3020",
    serviceToken: "test-token",
    logger: { error() {}, warn() {} } as never,
    maxInFlight: 1,
    protectedCapacity: 1,
    fetchImpl: async () => {
      fetchCalls += 1;
      return await new Promise<Response>((resolve) => {
        release = resolve;
      });
    },
  });

  const reservation = recorder.reserve("protected");
  assert.equal(reservation, "protected");
  assert.equal(recorder.reserve("protected"), undefined);
  const reserved = recorder({ requestId: "request-1", method: "POST" } as never, reservation);
  await Promise.resolve();

  assert.equal(fetchCalls, 1);
  release?.(new Response(null, { status: 204 }));
  await reserved;
  assert.equal(recorder.reserve("protected"), "protected");
});

test("createAuditRecorder keeps public traffic out of protected capacity", async () => {
  let releasePublic: ((response: Response) => void) | undefined;
  let fetchCalls = 0;
  const recorder = createAuditRecorder({
    enabled: true,
    serviceUrl: "http://audit-service:3020",
    serviceToken: "test-token",
    logger: { error() {}, warn() {} } as never,
    maxInFlight: 4,
    protectedCapacity: 3,
    fetchImpl: async () => {
      fetchCalls += 1;
      return await new Promise<Response>((resolve) => {
        releasePublic = resolve;
      });
    },
  });

  const publicRead = recorder({ requestId: "public-1", method: "GET" } as never);
  await Promise.resolve();
  await recorder({ requestId: "public-2", method: "GET" } as never);

  assert.equal(fetchCalls, 1);
  assert.equal(recorder.reserve("protected"), "protected");
  assert.equal(recorder.reserve("protected"), "protected");
  assert.equal(recorder.reserve("protected"), "protected");
  assert.equal(recorder.reserve("protected"), undefined);
  releasePublic?.(new Response(null, { status: 204 }));
  await publicRead;
});

test("createAuditRecorder preserves unlimited legacy concurrency unless configured", async () => {
  const releases: Array<(response: Response) => void> = [];
  let fetchCalls = 0;
  const recorder = createAuditRecorder({
    enabled: true,
    serviceUrl: "http://audit-service:3020",
    serviceToken: "test-token",
    logger: { error() {}, warn() {} } as never,
    fetchImpl: async () => {
      fetchCalls += 1;
      return await new Promise<Response>((resolve) => releases.push(resolve));
    },
  });

  const requests = Array.from({ length: 101 }, (_, index) =>
    recorder({ requestId: `request-${index + 1}`, method: "ENTITY_CHANGE" } as never),
  );
  await Promise.resolve();

  assert.equal(fetchCalls, 101);
  for (const release of releases) {
    release(new Response(null, { status: 204 }));
  }
  await Promise.all(requests);
});
