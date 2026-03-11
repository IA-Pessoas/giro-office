import assert from "node:assert/strict";
import { Writable } from "node:stream";
import test from "node:test";

import { createLogger } from "../../src/logger/index.js";

class MemoryLogStream extends Writable {
  private readonly chunks: string[] = [];

  _write(
    chunk: string | Uint8Array,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    this.chunks.push(chunk.toString());
    callback();
  }

  entries(): Record<string, unknown>[] {
    return this.chunks
      .join("")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Record<string, unknown>);
  }
}

async function waitForLogs(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

test("createLogger emits the expected structured shape", async () => {
  const stream = new MemoryLogStream();
  const logger = createLogger({
    service: "gateway",
    env: "production",
    destination: stream,
  });

  logger.warn({
    event: "http.request.completed",
    message: "HTTP request completed",
    request: {
      id: "req-1",
    },
    http: {
      statusCode: 401,
    },
  });

  await waitForLogs();

  const [entry] = stream.entries();

  assert.ok(typeof entry.timestamp === "string");
  assert.equal(entry.level, "warn");
  assert.equal(entry.service, "gateway");
  assert.equal(entry.env, "production");
  assert.equal(entry.event, "http.request.completed");
  assert.equal(entry.message, "HTTP request completed");
  assert.deepEqual(entry.request, { id: "req-1" });
  assert.deepEqual(entry.http, { statusCode: 401 });
  assert.equal(entry.msg, undefined);
});

test("createLogger redacts common sensitive fields", async () => {
  const stream = new MemoryLogStream();
  const logger = createLogger({
    service: "gateway",
    env: "test",
    destination: stream,
  });

  logger.info({
    event: "credentials.received",
    message: "Received user credentials",
    data: {
      apiKey: "key-1",
      password: "secret",
      token: "abc123",
    },
  });

  await waitForLogs();

  const [entry] = stream.entries();

  assert.deepEqual(entry.data, {
    apiKey: "[Redacted]",
    password: "[Redacted]",
    token: "[Redacted]",
  });
});
