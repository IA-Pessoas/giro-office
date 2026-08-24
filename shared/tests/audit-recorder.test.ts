import assert from "node:assert/strict";
import test from "node:test";

import { createAuditRecorder } from "../src/audit/recorder.js";

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
