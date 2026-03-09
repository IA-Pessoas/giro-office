import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { Writable } from "node:stream";
import test from "node:test";

import { createLogger } from "@workspace/shared/logger";

import { createApp } from "./app.js";
import type { GatewayEnv } from "./config/env.js";

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

function getBaseEnv(legacyApiUrl: string): GatewayEnv {
  return {
    allowedOrigins: ["*"],
    jwtSecret: "test-secret",
    legacyApiUrl,
    logLevel: "info",
    logPretty: false,
    nodeEnv: "test",
    port: 0,
  };
}

async function waitForLogs(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

async function listen(server: Server): Promise<number> {
  return await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      const address = server.address();

      if (!address || typeof address === "string") {
        reject(new Error("Unable to determine test server port."));
        return;
      }

      resolve(address.port);
    });
  });
}

async function closeServer(server: Server): Promise<void> {
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(undefined);
    });
  });
}

async function createUpstreamServer(
  handler: Parameters<typeof createServer>[0],
): Promise<{ port: number; server: Server; url: string }> {
  const server = createServer(handler);
  const port = await listen(server);

  return {
    port,
    server,
    url: `http://127.0.0.1:${port}`,
  };
}

async function createGatewayServer(
  env: GatewayEnv,
  stream: MemoryLogStream,
): Promise<{ server: Server; url: string }> {
  const logger = createLogger({
    service: "gateway",
    env: env.nodeEnv,
    level: env.logLevel,
    pretty: env.logPretty,
    destination: stream,
  });
  const app = createApp(env, logger);
  const server = createServer(app);
  const port = await listen(server);

  return {
    server,
    url: `http://127.0.0.1:${port}`,
  };
}

async function getClosedPort(): Promise<number> {
  const temporaryServer = createServer((_request, response) => {
    response.statusCode = 204;
    response.end();
  });
  const port = await listen(temporaryServer);
  await closeServer(temporaryServer);
  return port;
}

test("preserves inbound request ids in proxied requests", async (t) => {
  const stream = new MemoryLogStream();
  const upstream = await createUpstreamServer((request, response) => {
    assert.equal(request.headers["x-request-id"], "req-preserved");
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ ok: true }));
  });
  const gateway = await createGatewayServer(getBaseEnv(upstream.url), stream);

  t.after(async () => {
    await closeServer(gateway.server);
    await closeServer(upstream.server);
  });

  const response = await fetch(`${gateway.url}/session`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-request-id": "req-preserved",
    },
    body: JSON.stringify({ login: "user@example.com" }),
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-request-id"), "req-preserved");

  await waitForLogs();

  const [entry] = stream.entries().filter((log) => log.event === "http.request.completed");

  assert.equal(entry.level, "info");
  assert.equal((entry.request as { id?: string }).id, "req-preserved");
  assert.equal((entry.request as { method?: string }).method, "POST");
  assert.equal((entry.request as { path?: string }).path, "/session");
  assert.ok(typeof (entry.request as { ip?: string }).ip === "string");
  assert.equal((entry.http as { statusCode?: number }).statusCode, 200);
  assert.equal((entry.http as { responseSizeBytes?: number }).responseSizeBytes, 11);
  assert.ok((entry.http as { durationMs?: number }).durationMs !== undefined);
});

test("generates request ids when the client does not send one", async (t) => {
  const stream = new MemoryLogStream();
  const upstream = await createUpstreamServer((_request, response) => {
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ ok: true }));
  });
  const gateway = await createGatewayServer(getBaseEnv(upstream.url), stream);

  t.after(async () => {
    await closeServer(gateway.server);
    await closeServer(upstream.server);
  });

  const response = await fetch(`${gateway.url}/session`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ login: "user@example.com" }),
  });

  assert.equal(response.status, 200);

  const requestId = response.headers.get("x-request-id");

  assert.ok(requestId);

  await waitForLogs();

  const [entry] = stream.entries().filter((log) => log.event === "http.request.completed");

  assert.equal((entry.request as { id?: string }).id, requestId);
});

test("logs gateway errors once when the upstream request fails", async (t) => {
  const stream = new MemoryLogStream();
  const closedPort = await getClosedPort();
  const gateway = await createGatewayServer(getBaseEnv(`http://127.0.0.1:${closedPort}`), stream);

  t.after(async () => {
    await closeServer(gateway.server);
  });

  const response = await fetch(`${gateway.url}/session`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-request-id": "req-failure",
    },
    body: JSON.stringify({ login: "user@example.com" }),
  });

  assert.equal(response.status, 500);

  await waitForLogs();

  const entries = stream.entries();
  const gatewayError = entries.find((entry) => entry.event === "gateway.error");
  const requestCompleted = entries.find((entry) => entry.event === "http.request.completed");

  assert.ok(gatewayError);
  assert.equal(gatewayError.level, "error");
  assert.equal((gatewayError.request as { id?: string }).id, "req-failure");
  assert.equal((gatewayError.upstream as { host?: string }).host, `127.0.0.1:${closedPort}`);
  assert.ok(gatewayError.err);

  assert.ok(requestCompleted);
  assert.equal(requestCompleted.level, "error");
  assert.equal((requestCompleted.http as { statusCode?: number }).statusCode, 500);
  assert.equal((requestCompleted.request as { id?: string }).id, "req-failure");
  assert.equal(entries.filter((entry) => entry.event === "gateway.error").length, 1);
});

test("logs 4xx responses as warn", async (t) => {
  const stream = new MemoryLogStream();
  const gateway = await createGatewayServer(getBaseEnv("http://127.0.0.1:3333"), stream);

  t.after(async () => {
    await closeServer(gateway.server);
  });

  const response = await fetch(`${gateway.url}/private-route`, {
    method: "GET",
  });

  assert.equal(response.status, 401);

  await waitForLogs();

  const [entry] = stream.entries().filter((log) => log.event === "http.request.completed");

  assert.equal(entry.level, "warn");
  assert.equal((entry.http as { statusCode?: number }).statusCode, 401);
});

test("logs aborted requests when the client disconnects early", async (t) => {
  const stream = new MemoryLogStream();
  const upstream = await createUpstreamServer((_request, response) => {
    setTimeout(() => {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ ok: true }));
    }, 150);
  });
  const gateway = await createGatewayServer(getBaseEnv(upstream.url), stream);

  t.after(async () => {
    await closeServer(gateway.server);
    await closeServer(upstream.server);
  });

  await new Promise<void>((resolve, reject) => {
    const request = fetch(`${gateway.url}/session`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-request-id": "req-aborted",
      },
      body: JSON.stringify({ login: "user@example.com" }),
      signal: AbortSignal.timeout(20),
    });

    request.then(
      () => reject(new Error("Expected the client request to abort.")),
      () => resolve(),
    );
  });

  await new Promise((resolve) => setTimeout(resolve, 250));
  await waitForLogs();

  const abortedLog = stream.entries().find((entry) => entry.event === "http.request.aborted");

  assert.ok(abortedLog);
  assert.equal(abortedLog.level, "warn");
  assert.equal((abortedLog.request as { id?: string }).id, "req-aborted");
});
