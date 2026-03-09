import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { Writable } from "node:stream";
import test from "node:test";

import { createLogger } from "@workspace/shared/logger";
import jwt from "jsonwebtoken";

import { createApp } from "./app.js";
import type { GatewayEnv } from "./config/env.js";

class MemoryLogStream extends Writable {
  _write(
    _chunk: string | Uint8Array,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    callback();
  }
}

async function startServer(server: Server): Promise<string> {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Could not resolve server address.");
  }

  return `http://127.0.0.1:${address.port}`;
}

async function stopServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function createTestLogger() {
  return createLogger({
    service: "gateway-test",
    env: "test",
    destination: new MemoryLogStream(),
  });
}

function createEnv(overrides: Partial<GatewayEnv> = {}): GatewayEnv {
  return {
    nodeEnv: "test",
    port: 0,
    legacyApiUrl: "http://127.0.0.1:3333",
    jwtSecret: "test-secret",
    logLevel: "silent",
    logPretty: false,
    allowedOrigins: ["*"],
    ...overrides,
  };
}

function createToken(
  claims: { user_id: string; organization_id: string; permission: number },
  secret = "test-secret",
): string {
  return jwt.sign(claims, secret);
}

test("returns shared unauthorized response when token is missing", async () => {
  const app = createApp(createEnv(), createTestLogger());
  const server = createServer(app);
  const baseUrl = await startServer(server);

  try {
    const response = await fetch(`${baseUrl}/users`);
    const body = (await response.json()) as Record<string, string>;

    assert.equal(response.status, 401);
    assert.equal(body.error, "Cabeçalho Authorization não informado.");
    assert.equal(body.code, "UNAUTHORIZED");
    assert.ok(body.requestId);
  } finally {
    await stopServer(server);
  }
});

test("returns shared forbidden response when permission is insufficient", async () => {
  const app = createApp(createEnv(), createTestLogger());
  const server = createServer(app);
  const baseUrl = await startServer(server);
  const token = createToken({
    user_id: "user-1",
    organization_id: "org-1",
    permission: 1,
  });

  try {
    const response = await fetch(`${baseUrl}/users`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const body = (await response.json()) as Record<string, string>;

    assert.equal(response.status, 403);
    assert.equal(body.error, "Acesso negado para esta rota.");
    assert.equal(body.code, "FORBIDDEN");
    assert.ok(body.requestId);
  } finally {
    await stopServer(server);
  }
});

test("returns shared upstream error when the upstream service is unreachable", async () => {
  const app = createApp(
    createEnv({
      legacyApiUrl: "http://127.0.0.1:1",
    }),
    createTestLogger(),
  );
  const server = createServer(app);
  const baseUrl = await startServer(server);

  try {
    const response = await fetch(`${baseUrl}/session`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ login: "user", password: "secret" }),
    });
    const body = (await response.json()) as Record<string, string>;

    assert.equal(response.status, 502);
    assert.equal(body.error, "Erro ao comunicar com o serviço upstream.");
    assert.equal(body.code, "BAD_GATEWAY");
    assert.ok(body.requestId);
  } finally {
    await stopServer(server);
  }
});

test("passes upstream error responses through unchanged", async () => {
  const upstream = createServer((_request, response) => {
    response.statusCode = 418;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ error: "Teapot upstream" }));
  });
  const legacyApiUrl = await startServer(upstream);

  const app = createApp(createEnv({ legacyApiUrl }), createTestLogger());
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);

  try {
    const response = await fetch(`${gatewayUrl}/session`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ login: "user" }),
    });
    const body = (await response.json()) as Record<string, string>;

    assert.equal(response.status, 418);
    assert.deepEqual(body, { error: "Teapot upstream" });
  } finally {
    await stopServer(gateway);
    await stopServer(upstream);
  }
});
