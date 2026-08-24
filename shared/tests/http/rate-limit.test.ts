import assert from "node:assert/strict";
import test from "node:test";

import { ServiceError } from "../../src/http/errors.js";
import { createRateLimitMiddleware } from "../../src/http/rate-limit.js";

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

test("createRateLimitMiddleware bounds distinct in-memory keys", async () => {
  const middleware = createRateLimitMiddleware({
    key: "bounded-limit",
    max: 1,
    maxEntries: 2,
    windowMs: 60_000,
    now: () => 1_000,
    keyGenerator: (request) => String((request as unknown as { client: string }).client),
  });

  assert.equal(await runMiddleware(middleware, { client: "a" }), undefined);
  assert.equal(await runMiddleware(middleware, { client: "b" }), undefined);
  assert.equal(await runMiddleware(middleware, { client: "c" }), undefined);
  assert.equal(await runMiddleware(middleware, { client: "a" }), undefined);
});

test("createRateLimitMiddleware expurges expirados antes de remover uma chave ativa", async () => {
  let now = 1_000;
  const middleware = createRateLimitMiddleware({
    key: "expiring-limit",
    max: 1,
    maxEntries: 2,
    windowMs: 1_000,
    now: () => now,
    keyGenerator: (request) => String((request as unknown as { client: string }).client),
  });

  assert.equal(await runMiddleware(middleware, { client: "a" }), undefined);
  assert.equal(await runMiddleware(middleware, { client: "b" }), undefined);
  now += 1_001;
  assert.equal(await runMiddleware(middleware, { client: "a" }), undefined);
  assert.equal(await runMiddleware(middleware, { client: "c" }), undefined);

  const activeKeyError = await runMiddleware(middleware, { client: "a" });
  assert(activeKeyError instanceof ServiceError);
  assert.equal(activeKeyError.statusCode, 429);
});
