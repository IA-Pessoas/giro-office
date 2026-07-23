import assert from "node:assert/strict";
import { createServer as createHttpServer } from "node:http";
import { createServer as createTcpServer } from "node:net";
import test from "node:test";

import { createHealthMonitor, waitForHttpHealth, waitForTcp } from "./dev-readiness.mjs";

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return server.address().port;
}

async function close(server) {
  server.closeAllConnections?.();
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

test("HTTP readiness waits for a 2xx response", async (t) => {
  let healthy = false;
  const server = createHttpServer((_request, response) => {
    response.statusCode = healthy ? 200 : 503;
    response.end();
  });
  t.after(() => close(server));
  const port = await listen(server);
  setTimeout(() => {
    healthy = true;
  }, 40);

  await waitForHttpHealth(
    { name: "fixture", readiness: { url: `http://127.0.0.1:${port}/health` } },
    { timeoutMs: 1000, intervalMs: 10 },
  );
});

test("watcher alive without a server still times out", async () => {
  await assert.rejects(
    waitForHttpHealth(
      { name: "dead-service", readiness: { url: "http://127.0.0.1:1/health" } },
      { timeoutMs: 50, intervalMs: 10 },
    ),
    /dead-service.*readiness timeout/,
  );
});

test("TCP readiness resolves when the port accepts connections", async (t) => {
  const server = createTcpServer();
  t.after(() => close(server));
  const port = await listen(server);

  await waitForTcp(
    { name: "web", readiness: { host: "127.0.0.1", port } },
    { timeoutMs: 500, intervalMs: 10 },
  );
});

test("health monitor reports a target after consecutive failures", async () => {
  let checks = 0;
  const failures = [];
  const monitor = createHealthMonitor(
    [{ name: "service", readiness: { type: "http", url: "http://service/health" } }],
    {
      intervalMs: 5,
      failureThreshold: 3,
      probe: async () => {
        checks += 1;
        throw new Error("offline");
      },
      onFailure: (target, error) => failures.push({ target, error }),
    },
  );

  monitor.start();
  await new Promise((resolve) => setTimeout(resolve, 40));
  monitor.stop();

  assert.ok(checks >= 3);
  assert.equal(failures.length, 1);
  assert.equal(failures[0].target.name, "service");
  assert.match(failures[0].error.message, /3 consecutive/);
});

test("a successful health probe resets the consecutive failure count", async () => {
  const outcomes = [false, false, true, false, false, true];
  const failures = [];
  const monitor = createHealthMonitor(
    [{ name: "service", readiness: { type: "http", url: "http://service/health" } }],
    {
      intervalMs: 5,
      failureThreshold: 3,
      probe: async () => {
        if (!outcomes.shift()) throw new Error("offline");
      },
      onFailure: (...args) => failures.push(args),
    },
  );

  monitor.start();
  await new Promise((resolve) => setTimeout(resolve, 35));
  monitor.stop();

  assert.equal(failures.length, 0);
});
