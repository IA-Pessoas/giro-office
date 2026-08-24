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
