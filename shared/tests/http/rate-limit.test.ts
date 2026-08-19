import assert from "node:assert/strict";
import test from "node:test";

import { ServiceError } from "../../src/http/errors.js";
import {
  createMemoryRateLimitStore,
  createPostgresRateLimitStore,
  createRateLimitMiddleware,
} from "../../src/http/rate-limit.js";

type NextResult = Error | undefined;

async function runMiddleware(
  middleware: ReturnType<typeof createRateLimitMiddleware>,
  request: Record<string, unknown>,
): Promise<NextResult> {
  return await new Promise<NextResult>((resolve) => {
    middleware(
      request as never,
      {
        setHeader() {
          return this;
        },
      } as never,
      (error?: Error) => resolve(error),
    );
  });
}

test("createRateLimitMiddleware allows requests below the fixed-window limit", async () => {
  let now = 1_000;
  const middleware = createRateLimitMiddleware({
    key: "test-limit",
    max: 2,
    windowMs: 60_000,
    now: () => now,
    keyGenerator: () => "client-1",
  });

  assert.equal(await runMiddleware(middleware, {}), undefined);
  assert.equal(await runMiddleware(middleware, {}), undefined);

  now += 60_001;
  assert.equal(await runMiddleware(middleware, {}), undefined);
});

test("createRateLimitMiddleware rejects requests above the fixed-window limit", async () => {
  const middleware = createRateLimitMiddleware({
    key: "test-limit",
    max: 1,
    windowMs: 60_000,
    now: () => 1_000,
    keyGenerator: () => "client-1",
  });

  assert.equal(await runMiddleware(middleware, {}), undefined);
  const error = await runMiddleware(middleware, {});

  assert(error instanceof ServiceError);
  assert.equal(error.statusCode, 429);
  assert.match(error.message, /Muitas requisições/);
});

test("createRateLimitMiddleware uses auth context before IP when generating default keys", async () => {
  const middleware = createRateLimitMiddleware({
    key: "test-limit",
    max: 1,
    windowMs: 60_000,
    now: () => 1_000,
  });

  assert.equal(
    await runMiddleware(middleware, {
      auth: { userId: "user-1", organizationId: "org-1" },
      ip: "127.0.0.1",
    }),
    undefined,
  );

  const error = await runMiddleware(middleware, {
    auth: { userId: "user-1", organizationId: "org-1" },
    ip: "127.0.0.2",
  });

  assert(error instanceof ServiceError);
  assert.equal(error.statusCode, 429);
});

test("shares one atomic bucket between concurrent consumers", async () => {
  const store = createMemoryRateLimitStore();
  const results = await Promise.all(
    Array.from({ length: 8 }, () => store.consume({ key: "safe", max: 3, windowMs: 60_000 })),
  );

  assert.equal(results.filter((result) => !result.allowed).length, 5);
});

test("resets a memory bucket after its expiry", async () => {
  const store = createMemoryRateLimitStore();

  assert.deepEqual(
    await store.consume({ key: "safe", max: 1, windowMs: 60_000, now: new Date(1_000) }),
    { allowed: true, retryAfterSeconds: 60 },
  );
  assert.equal(
    (await store.consume({ key: "safe", max: 1, windowMs: 60_000, now: new Date(1_000) })).allowed,
    false,
  );
  assert.equal(
    (await store.consume({ key: "safe", max: 1, windowMs: 60_000, now: new Date(61_000) })).allowed,
    true,
  );
});

test("maps the atomic PostgreSQL result to the rate-limit contract", async () => {
  let receivedQuery = "";
  let receivedValues: readonly unknown[] = [];
  const store = createPostgresRateLimitStore({
    async query(text, values) {
      receivedQuery = text;
      receivedValues = values;
      return { rows: [{ allowed: false, retry_after_seconds: 42 }] };
    },
  });

  assert.deepEqual(await store.consume({ key: "safe", max: 3, windowMs: 60_000 }), {
    allowed: false,
    retryAfterSeconds: 42,
  });
  assert.match(receivedQuery, /INSERT INTO security\.rate_limit_buckets/);
  assert.deepEqual(receivedValues, ["safe", 60_000, 3]);
});
