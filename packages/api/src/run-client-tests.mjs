import assert from "node:assert/strict";
import { createServer } from "node:http";

import { createApiClient } from "./client.ts";

async function withServer(run) {
  const requests = [];
  const server = createServer((request, response) => {
    requests.push({ headers: request.headers, method: request.method, url: request.url });
    response.writeHead(200, { "content-type": "application/json" });
    response.end("{}");
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();

  try {
    assert.ok(address && typeof address !== "string");
    await run(`http://127.0.0.1:${address.port}`, requests);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

await withServer(async (baseURL, requests) => {
  const api = createApiClient({
    baseURL,
    cookieHeader: "cw.session=signed; cw.csrf=browser-token",
    getCsrfToken: () => "browser-token",
  });

  assert.equal(api.defaults.withCredentials, true);

  await api.get("/safe");
  await api.post("/unsafe", { ok: true });

  assert.equal(requests[0].headers.cookie, "cw.session=signed; cw.csrf=browser-token");
  assert.equal(requests[0].headers["x-csrf-token"], undefined);
  assert.equal(requests[1].headers.cookie, "cw.session=signed; cw.csrf=browser-token");
  assert.equal(requests[1].headers["x-csrf-token"], "browser-token");
});

console.log("PASS API client forwards HttpOnly sessions and binds CSRF to unsafe requests");

async function expectConflictHandling({ rotateBeforeResponse, expectedUnauthorizedCalls }) {
  let csrfToken = "old-browser-token";
  let unauthorizedCalls = 0;
  const server = createServer((_request, response) => {
    if (rotateBeforeResponse) {
      csrfToken = "new-browser-token";
    }
    response.writeHead(409, {
      "content-type": "application/json",
      "x-auth-session-state": "superseded",
    });
    response.end("{}");
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();

  try {
    assert.ok(address && typeof address !== "string");
    globalThis.window = {};
    const api = createApiClient({
      baseURL: `http://127.0.0.1:${address.port}`,
      getCsrfToken: () => csrfToken,
      onUnauthorized: () => {
        unauthorizedCalls += 1;
      },
    });

    await assert.rejects(api.post("/conflict", {}), { status: 409 });
    assert.equal(unauthorizedCalls, expectedUnauthorizedCalls);
  } finally {
    delete globalThis.window;
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

await expectConflictHandling({ rotateBeforeResponse: true, expectedUnauthorizedCalls: 0 });
await expectConflictHandling({ rotateBeforeResponse: false, expectedUnauthorizedCalls: 1 });

console.log("PASS API client distinguishes stale in-flight conflicts from a lost refresh response");

async function expectPendingRefreshWinsConflictRace() {
  let csrfToken = "old-browser-token";
  let unauthorizedCalls = 0;
  let markRefreshStarted;
  const refreshStarted = new Promise((resolve) => {
    markRefreshStarted = resolve;
  });
  const server = createServer((request, response) => {
    if (request.url === "/user/session/refresh") {
      markRefreshStarted();
      setTimeout(() => {
        csrfToken = "new-browser-token";
        response.writeHead(200, { "content-type": "application/json" });
        response.end("{}");
      }, 25);
      return;
    }

    response.writeHead(409, {
      "content-type": "application/json",
      "x-auth-session-state": "superseded",
    });
    response.end("{}");
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();

  try {
    assert.ok(address && typeof address !== "string");
    globalThis.window = {};
    const api = createApiClient({
      baseURL: `http://127.0.0.1:${address.port}`,
      getCsrfToken: () => csrfToken,
      onUnauthorized: () => {
        unauthorizedCalls += 1;
      },
    });

    const refresh = api.post("/user/session/refresh", {});
    await refreshStarted;
    await assert.rejects(api.post("/conflict", {}), { status: 409 });
    await refresh;
    assert.equal(unauthorizedCalls, 0);
  } finally {
    delete globalThis.window;
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

await expectPendingRefreshWinsConflictRace();

console.log("PASS API client waits for a winning refresh before handling a session conflict");

function createMemoryStorage() {
  const values = new Map();
  return {
    get length() {
      return values.size;
    },
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, String(value)),
  };
}

async function expectCrossTabRefreshWinsConflictRace() {
  let csrfToken = "old-browser-token";
  let unauthorizedCalls = 0;
  let markRefreshStarted;
  const refreshStarted = new Promise((resolve) => {
    markRefreshStarted = resolve;
  });
  const server = createServer((request, response) => {
    if (request.url === "/user/session/refresh") {
      markRefreshStarted();
      setTimeout(() => {
        csrfToken = "new-browser-token";
        response.writeHead(200, { "content-type": "application/json" });
        response.end("{}");
      }, 25);
      return;
    }
    response.writeHead(409, {
      "content-type": "application/json",
      "x-auth-session-state": "superseded",
    });
    response.end("{}");
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();

  try {
    assert.ok(address && typeof address !== "string");
    globalThis.window = { localStorage: createMemoryStorage() };
    const sharedOptions = {
      baseURL: `http://127.0.0.1:${address.port}`,
      getCsrfToken: () => csrfToken,
      onUnauthorized: () => {
        unauthorizedCalls += 1;
      },
    };
    const refreshClient = createApiClient(sharedOptions);
    const requestClient = createApiClient(sharedOptions);

    const refresh = refreshClient.post("/user/session/refresh", {});
    await refreshStarted;
    await assert.rejects(requestClient.post("/conflict", {}), { status: 409 });
    await refresh;
    assert.equal(unauthorizedCalls, 0);
  } finally {
    delete globalThis.window;
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

await expectCrossTabRefreshWinsConflictRace();

console.log("PASS API client coordinates a winning refresh across browser clients");

async function expectHangingRefreshWaitIsBounded() {
  let csrfToken = "old-browser-token";
  let startedRefreshes = 0;
  let markRefreshesStarted;
  const refreshesStarted = new Promise((resolve) => {
    markRefreshesStarted = resolve;
  });
  const server = createServer((request, response) => {
    if (request.url === "/user/session/refresh?mode=winner") {
      startedRefreshes += 1;
      if (startedRefreshes === 2) markRefreshesStarted();
      setTimeout(() => {
        csrfToken = "new-browser-token";
        response.writeHead(200, { "content-type": "application/json" });
        response.end("{}");
      }, 25);
      return;
    }
    if (request.url === "/user/session/refresh?mode=hanging") {
      startedRefreshes += 1;
      if (startedRefreshes === 2) markRefreshesStarted();
      return;
    }
    response.writeHead(409, {
      "content-type": "application/json",
      "x-auth-session-state": "superseded",
    });
    response.end("{}");
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const abortController = new AbortController();

  try {
    assert.ok(address && typeof address !== "string");
    globalThis.window = { localStorage: createMemoryStorage() };
    const api = createApiClient({
      baseURL: `http://127.0.0.1:${address.port}`,
      getCsrfToken: () => csrfToken,
    });
    const winner = api.post("/user/session/refresh?mode=winner", {});
    const hanging = api
      .post("/user/session/refresh?mode=hanging", {}, { signal: abortController.signal })
      .catch(() => undefined);
    await refreshesStarted;

    const conflict = api.post("/conflict", {}).then(
      () => "unexpected-success",
      () => "conflict",
    );
    const outcome = await Promise.race([
      conflict,
      new Promise((resolve) => setTimeout(() => resolve("timeout"), 1_500)),
    ]);

    assert.equal(outcome, "conflict");
    await winner;
    abortController.abort();
    await hanging;
  } finally {
    abortController.abort();
    delete globalThis.window;
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

await expectHangingRefreshWaitIsBounded();

console.log("PASS API client bounds conflict waits when a peer refresh hangs");
