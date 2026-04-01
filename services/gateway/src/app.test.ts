import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, type IncomingMessage, request as nodeRequest, type Server } from "node:http";
import { Writable } from "node:stream";
import test from "node:test";

import {
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
  createLogger,
} from "@workspace/shared";
import type { CreateAuditRequestPayload } from "@workspace/shared";
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

async function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")) as T);
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
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

async function waitForRecords(
  records: CreateAuditRequestPayload[],
  expectedCount: number,
): Promise<void> {
  const startedAt = Date.now();

  while (records.length < expectedCount) {
    if (Date.now() - startedAt > 1_000) {
      throw new Error(`Timed out waiting for ${expectedCount} audit record(s).`);
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
  }
}

async function startAuditIngestServer(): Promise<{
  records: CreateAuditRequestPayload[];
  server: Server;
  url: string;
}> {
  const records: CreateAuditRequestPayload[] = [];
  const server = createServer(async (request, response) => {
    if (request.method === "POST" && request.url === "/internal/audit/requests") {
      records.push(await readJsonBody<CreateAuditRequestPayload>(request));
      response.statusCode = 201;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ success: true, data: { requestId: "ok" } }));
      return;
    }

    response.statusCode = 404;
    response.end();
  });

  return {
    records,
    server,
    url: await startServer(server),
  };
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
    auditEnabled: false,
    auditServiceToken: "audit-service-token",
    auditServiceUrl: "http://127.0.0.1:3335",
    port: 0,
    userServiceUrl: "http://127.0.0.1:3335",
    taskServiceUrl: "http://127.0.0.1:3337",
    projectServiceUrl: "http://127.0.0.1:3338",
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
    const body = (await response.json()) as Record<string, unknown>;

    assert.equal(response.status, 401);
    assert.equal(body.success, false);
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
    const body = (await response.json()) as Record<string, unknown>;

    assert.equal(response.status, 403);
    assert.equal(body.success, false);
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
      userServiceUrl: "http://127.0.0.1:1",
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
    const body = (await response.json()) as Record<string, unknown>;

    assert.equal(response.status, 502);
    assert.equal(body.success, false);
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
  const userServiceUrl = await startServer(upstream);

  const app = createApp(createEnv({ userServiceUrl }), createTestLogger());
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

test("returns the shared success envelope for gateway health", async () => {
  const app = createApp(createEnv(), createTestLogger());
  const server = createServer(app);
  const baseUrl = await startServer(server);

  try {
    const response = await fetch(`${baseUrl}/health`);
    const body = (await response.json()) as Record<string, unknown>;

    assert.equal(response.status, 200);
    assert.deepEqual(body, {
      success: true,
      data: {
        status: "ok",
        service: "gateway",
      },
    });
  } finally {
    await stopServer(server);
  }
});

test("returns 404 for routes not mapped to any upstream", async () => {
  const token = createToken({
    user_id: "user-1",
    organization_id: "org-1",
    permission: 2,
  });
  const app = createApp(createEnv(), createTestLogger());
  const server = createServer(app);
  const baseUrl = await startServer(server);

  try {
    const response = await fetch(`${baseUrl}/rota-so-legado`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const body = (await response.json()) as Record<string, unknown>;

    assert.equal(response.status, 404);
    assert.equal(body.success, false);
    assert.equal(body.error, "Rota não mapeada no gateway.");
  } finally {
    await stopServer(server);
  }
});

test("returns 404 for audit routes when the feature flag is disabled", async () => {
  const app = createApp(createEnv(), createTestLogger());
  const server = createServer(app);
  const baseUrl = await startServer(server);

  try {
    const response = await fetch(`${baseUrl}/audit/requests`);
    const body = (await response.json()) as Record<string, unknown>;

    assert.equal(response.status, 404);
    assert.equal(body.error, "Recurso não encontrado.");
  } finally {
    await stopServer(server);
  }
});

test("proxies audit routes to the audit service when the feature flag is enabled", async () => {
  const token = createToken({
    user_id: "user-1",
    organization_id: "org-1",
    permission: 2,
  });
  let seenHeaders: { internalToken?: string; userId?: string; organizationId?: string } = {};

  const auditService = createServer((request, response) => {
    seenHeaders = {
      internalToken: request.headers[INTERNAL_SERVICE_TOKEN_HEADER] as string | undefined,
      userId: request.headers[FORWARDED_AUTH_USER_ID_HEADER] as string | undefined,
      organizationId: request.headers[FORWARDED_AUTH_ORGANIZATION_ID_HEADER] as string | undefined,
    };
    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    response.end(
      JSON.stringify({ success: true, data: { items: [], total: 0, page: 1, pageSize: 50 } }),
    );
  });
  const auditServiceUrl = await startServer(auditService);

  const app = createApp(
    createEnv({
      auditEnabled: true,
      auditServiceUrl,
    }),
    createTestLogger(),
  );
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);

  try {
    const response = await fetch(`${gatewayUrl}/audit/requests`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const body = (await response.json()) as Record<string, unknown>;

    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(seenHeaders.internalToken, "audit-service-token");
    assert.equal(seenHeaders.userId, "user-1");
    assert.equal(seenHeaders.organizationId, "org-1");
  } finally {
    await stopServer(gateway);
    await stopServer(auditService);
  }
});

test("records successful proxied requests when audit is enabled", async () => {
  const token = createToken({
    user_id: "user-1",
    organization_id: "org-1",
    permission: 2,
  });
  const auditService = await startAuditIngestServer();
  const upstream = createServer((_request, response) => {
    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ ok: true }));
  });
  const userServiceUrl = await startServer(upstream);

  const app = createApp(
    createEnv({
      auditEnabled: true,
      auditServiceUrl: auditService.url,
      userServiceUrl,
    }),
    createTestLogger(),
  );
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);

  try {
    const response = await fetch(`${gatewayUrl}/users`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    assert.equal(response.status, 200);

    await waitForRecords(auditService.records, 1);

    assert.equal(auditService.records.length, 1);
    assert.equal(auditService.records[0]?.requestId.length > 0, true);
    assert.equal(auditService.records[0]?.organizationId, "org-1");
    assert.equal(auditService.records[0]?.userId, "user-1");
    assert.equal(auditService.records[0]?.statusCode, 200);
    assert.equal(auditService.records[0]?.outcome, "success");
  } finally {
    await stopServer(gateway);
    await stopServer(upstream);
    await stopServer(auditService.server);
  }
});

test("records unauthorized requests when audit is enabled", async () => {
  const auditService = await startAuditIngestServer();
  const app = createApp(
    createEnv({
      auditEnabled: true,
      auditServiceUrl: auditService.url,
    }),
    createTestLogger(),
  );
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);

  try {
    const response = await fetch(`${gatewayUrl}/users`);

    assert.equal(response.status, 401);

    await waitForRecords(auditService.records, 1);

    assert.equal(auditService.records.length, 1);
    assert.equal(auditService.records[0]?.statusCode, 401);
    assert.equal(auditService.records[0]?.outcome, "error");
    assert.equal(auditService.records[0]?.errorCode, "UNAUTHORIZED");
    assert.equal(auditService.records[0]?.userId, undefined);
  } finally {
    await stopServer(gateway);
    await stopServer(auditService.server);
  }
});

test("records bad gateway failures when audit is enabled", async () => {
  const auditService = await startAuditIngestServer();
  const app = createApp(
    createEnv({
      auditEnabled: true,
      auditServiceUrl: auditService.url,
      userServiceUrl: "http://127.0.0.1:1",
    }),
    createTestLogger(),
  );
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

    assert.equal(response.status, 502);

    await waitForRecords(auditService.records, 1);

    assert.equal(auditService.records.length, 1);
    assert.equal(auditService.records[0]?.statusCode, 502);
    assert.equal(auditService.records[0]?.outcome, "error");
    assert.equal(auditService.records[0]?.errorCode, "BAD_GATEWAY");
  } finally {
    await stopServer(gateway);
    await stopServer(auditService.server);
  }
});

test("records aborted requests when audit is enabled", async () => {
  const token = createToken({
    user_id: "user-1",
    organization_id: "org-1",
    permission: 2,
  });
  const auditService = await startAuditIngestServer();
  const upstream = createServer((_request, _response) => {
    setTimeout(() => {
      if (!_response.headersSent) {
        _response.statusCode = 200;
        _response.setHeader("content-type", "application/json");
        _response.end(JSON.stringify({ ok: true }));
      }
    }, 100);
  });
  const userServiceUrl = await startServer(upstream);

  const app = createApp(
    createEnv({
      auditEnabled: true,
      auditServiceUrl: auditService.url,
      userServiceUrl,
    }),
    createTestLogger(),
  );
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);
  const { hostname, port } = new URL(gatewayUrl);

  try {
    await new Promise<void>((resolve) => {
      const request = nodeRequest(
        {
          hostname,
          port,
          path: "/users",
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
        () => {
          resolve();
        },
      );

      request.on("error", () => {
        resolve();
      });
      request.end();

      setTimeout(() => {
        request.destroy();
      }, 10);
    });

    await new Promise((resolve) => {
      setTimeout(resolve, 150);
    });

    await waitForRecords(auditService.records, 1);

    assert.equal(auditService.records.length, 1);
    assert.equal(auditService.records[0]?.statusCode, 499);
    assert.equal(auditService.records[0]?.outcome, "aborted");
  } finally {
    await stopServer(gateway);
    await stopServer(upstream);
    await stopServer(auditService.server);
  }
});

test("does not change responses when audit ingestion fails", async () => {
  const app = createApp(
    createEnv({
      auditEnabled: true,
      auditServiceUrl: "http://127.0.0.1:1",
    }),
    createTestLogger(),
  );
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);

  try {
    const response = await fetch(`${gatewayUrl}/health`);
    const body = (await response.json()) as Record<string, unknown>;

    assert.equal(response.status, 200);
    assert.equal(body.success, true);
  } finally {
    await stopServer(gateway);
  }
});
