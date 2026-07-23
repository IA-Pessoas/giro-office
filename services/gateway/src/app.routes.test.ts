import { once } from "node:events";
import { createServer, type IncomingMessage, request as nodeRequest, type Server } from "node:http";
import { Writable } from "node:stream";

import type { CreateAuditRequestPayload } from "@workspace/shared";
import {
  createLogger,
  FORWARDED_AUTH_MODULES_HEADER,
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_PERMISSION_HEADER,
  FORWARDED_AUTH_TYPE_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
} from "@workspace/shared";
import { MemoryLogStream } from "@workspace/shared/testUtils";
import jwt from "jsonwebtoken";
import { expect, it, vi } from "vitest";

import { createApp } from "./app.js";
import type { GatewayEnv } from "./config/env.js";
import { getGatewayServiceDefinitions } from "./config/serviceRegistry.js";

class CapturingLogStream extends Writable {
  private readonly chunks: string[] = [];

  override _write(
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

async function waitForLogs(): Promise<void> {
  await new Promise((resolve) => {
    setImmediate(resolve);
  });
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

function createCapturedTestLogger() {
  const stream = new CapturingLogStream();
  const logger = createLogger({
    service: "gateway-test",
    env: "test",
    destination: stream,
  });

  return { logger, stream };
}

function createEnv(overrides: Partial<GatewayEnv> = {}): GatewayEnv {
  return {
    nodeEnv: "test",
    auditEnabled: false,
    auditServiceToken: "audit-service-token",
    auditServiceUrl: "http://127.0.0.1:3020",
    port: 0,
    organizationServiceUrl: "http://127.0.0.1:3031",
    rhServiceUrl: "http://127.0.0.1:3034",
    userServiceUrl: "http://127.0.0.1:3030",
    taskServiceUrl: "http://127.0.0.1:3032",
    projectServiceUrl: "http://127.0.0.1:3033",
    clientServiceUrl: "http://127.0.0.1:3035",
    departmentServiceUrl: "http://127.0.0.1:3336",
    fiscalServiceUrl: "http://127.0.0.1:3037",
    contabilServiceUrl: "http://127.0.0.1:3038",
    regularizeServiceUrl: "http://127.0.0.1:3039",
    tiServiceUrl: "http://127.0.0.1:3040",
    tiServiceInternalToken: "ti-service-token",
    certificateServiceUrl: "http://127.0.0.1:3041",
    certificateServiceInternalToken: "certificate-service-token",
    pessoalServiceUrl: "http://127.0.0.1:3042",
    parcelamentoServiceUrl: "http://127.0.0.1:3043",
    databaseUrl: "postgres://test:test@127.0.0.1:5432/gateway_test",

    jwtSecret: "test-secret",
    logLevel: "silent",
    logPretty: false,
    allowedOrigins: ["*"],
    rateLimitMax: 300,
    rateLimitWindowMs: 60_000,
    authRateLimitMax: 10,
    authRateLimitWindowMs: 60_000,
    jsonBodyLimit: "1mb",
    ...overrides,
  };
}

function createToken(
  claims: {
    user_id: string;
    organization_id: string;
    permission: number;
    type?: "owner" | "admin" | "user";
    modules?: Record<string, number | null>;
  },
  secret = "test-secret",
): string {
  return jwt.sign(claims, secret);
}

it("returns real dashboard stats for the authenticated organization", async () => {
  const getStats = vi.fn(async (_organizationId: string) => ({
    updatedAt: "2026-07-21T15:30:00.000Z",
    totalClients: 1146,
    clientsByService: {
      contabil: 452,
      fiscal: 792,
      pessoal: 835,
      infoproduto: 30,
      consultoria: 7,
      castelo_med: 23,
    },
    monthlyTrends: [{ month: "Jul", newClients: 1146 }],
    fiscal: {
      obligations: [
        { status: "Pendente", count: 0 },
        { status: "Emitida", count: 0 },
        { status: "Atrasada", count: 0 },
      ],
    },
    recentClients: [],
    insights: [],
    tasks: {
      today: 0,
      completedToday: 0,
      pending: 13605,
      urgent: 0,
    },
    notifications: {
      total: 0,
      urgent: 0,
      pending: 0,
    },
    projects: {
      active: 331,
      completed: 749,
      inProgress: 283,
      delayed: 283,
      waiting: 47,
    },
    revenue: {
      currentMonth: 0,
      target: 0,
      monthly: [{ month: "Jul", revenue: 0, expenses: 0 }],
    },
    performance: [{ week: "Sem 1", tasks: 10, completed: 5 }],
    pendingTasks: [],
    activities: [],
  }));
  const app = createApp(createEnv(), createTestLogger(), {
    dashboardStatsService: { getStats },
  });
  const server = createServer(app);
  const baseUrl = await startServer(server);
  const token = createToken({
    user_id: "user-1",
    organization_id: "org-dashboard",
    permission: 1,
  });

  try {
    const response = await fetch(`${baseUrl}/dashboard/stats`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const body = (await response.json()) as {
      success?: boolean;
      data?: { totalClients?: number; revenue?: { currentMonth?: number } };
    };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data?.totalClients).toBe(1146);
    expect(body.data?.revenue?.currentMonth).toBe(0);
    expect(getStats).toHaveBeenCalledWith("org-dashboard");
  } finally {
    await stopServer(server);
  }
});

it("returns shared unauthorized response when token is missing", async () => {
  const app = createApp(createEnv(), createTestLogger());
  const server = createServer(app);
  const baseUrl = await startServer(server);

  try {
    const response = await fetch(`${baseUrl}/user`);
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.error).toBe("Cabeçalho Authorization não informado.");
    expect(body.code).toBe("UNAUTHORIZED");
    expect(body.requestId).toBeTruthy();
  } finally {
    await stopServer(server);
  }
});

it("returns shared forbidden response when permission is insufficient", async () => {
  const app = createApp(createEnv(), createTestLogger());
  const server = createServer(app);
  const baseUrl = await startServer(server);
  const token = createToken({
    user_id: "user-1",
    organization_id: "org-1",
    permission: 1,
  });

  try {
    const response = await fetch(`${baseUrl}/user`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error).toBe("Acesso negado para esta rota.");
    expect(body.code).toBe("FORBIDDEN");
    expect(body.requestId).toBeTruthy();
  } finally {
    await stopServer(server);
  }
});

it("requires admin permission for user-management routes", async () => {
  const app = createApp(createEnv(), createTestLogger());
  const server = createServer(app);
  const baseUrl = await startServer(server);
  const token = createToken({
    user_id: "user-1",
    organization_id: "org-1",
    permission: 1,
  });
  const routes = [
    { method: "GET", path: "/user" },
    { method: "GET", path: "/user/user-3" },
    { method: "GET", path: "/user/user-3/photo" },
    { method: "PATCH", path: "/user/user-3" },
    { method: "POST", path: "/user/user-3/photo" },
    { method: "DELETE", path: "/user/user-3/photo" },
    { method: "DELETE", path: "/user/user-3" },
    { method: "GET", path: "/user/permission/user-3" },
  ];

  try {
    for (const route of routes) {
      const response = await fetch(`${baseUrl}${route.path}`, {
        method: route.method,
        headers: {
          Authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: route.method === "GET" ? undefined : JSON.stringify({ name: "Blocked" }),
      });
      const body = (await response.json()) as Record<string, unknown>;

      expect(response.status).toBe(403);
      expect(body.success).toBe(false);
      expect(body.code).toBe("FORBIDDEN");
    }
  } finally {
    await stopServer(server);
  }
});

it("allows RH module admins to proxy user-management routes", async () => {
  let seenHeaders: {
    userId?: string;
    organizationId?: string;
    permission?: string;
    type?: string;
    modules?: string;
  } = {};

  const upstream = createServer((request, response) => {
    seenHeaders = {
      userId: request.headers[FORWARDED_AUTH_USER_ID_HEADER] as string | undefined,
      organizationId: request.headers[FORWARDED_AUTH_ORGANIZATION_ID_HEADER] as string | undefined,
      permission: request.headers[FORWARDED_AUTH_PERMISSION_HEADER] as string | undefined,
      type: request.headers[FORWARDED_AUTH_TYPE_HEADER] as string | undefined,
      modules: request.headers[FORWARDED_AUTH_MODULES_HEADER] as string | undefined,
    };
    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ success: true, data: { users: [] } }));
  });
  const userServiceUrl = await startServer(upstream);
  const app = createApp(createEnv({ userServiceUrl }), createTestLogger());
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);
  const token = createToken({
    user_id: "rh-admin",
    organization_id: "org-1",
    permission: 1,
    type: "admin",
    modules: { rh: 2 },
  });

  try {
    const response = await fetch(`${gatewayUrl}/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    expect(response.status).toBe(200);
    expect(seenHeaders.userId).toBe("rh-admin");
    expect(seenHeaders.organizationId).toBe("org-1");
    expect(seenHeaders.permission).toBe("1");
    expect(seenHeaders.type).toBe("admin");
    expect(JSON.parse(seenHeaders.modules ?? "{}")).toMatchObject({ rh: 2 });
  } finally {
    await stopServer(gateway);
    await stopServer(upstream);
  }
});

it("blocks non-RH module admins from user management routes", async () => {
  let seenRequest = false;
  const upstream = createServer((_request, response) => {
    seenRequest = true;
    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ success: true, data: { users: [] } }));
  });
  const userServiceUrl = await startServer(upstream);
  const app = createApp(createEnv({ userServiceUrl }), createTestLogger());
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);
  const token = createToken({
    user_id: "comercial-admin-1",
    organization_id: "org-1",
    permission: 2,
    type: "admin",
    modules: { comercial: 2 },
  });

  try {
    const response = await fetch(`${gatewayUrl}/user`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(403);
    expect(seenRequest).toBe(false);
  } finally {
    await stopServer(gateway);
    await stopServer(upstream);
  }
});

it("allows RH module admins to proxy permission update routes", async () => {
  let seenRequest = false;
  const upstream = createServer((_request, response) => {
    seenRequest = true;
    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ success: true, data: {} }));
  });
  const userServiceUrl = await startServer(upstream);
  const app = createApp(createEnv({ userServiceUrl }), createTestLogger());
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);
  const token = createToken({
    user_id: "rh-admin-1",
    organization_id: "org-1",
    permission: 2,
    type: "admin",
    modules: { rh: 2 },
  });

  try {
    const response = await fetch(`${gatewayUrl}/user/permission/user-1`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ rh: 2 }),
    });

    expect(response.status).toBe(200);
    expect(seenRequest).toBe(true);
  } finally {
    await stopServer(gateway);
    await stopServer(upstream);
  }
});

it("returns shared forbidden response when permission update is attempted without admin permission", async () => {
  const app = createApp(createEnv(), createTestLogger());
  const server = createServer(app);
  const baseUrl = await startServer(server);
  const token = createToken({
    user_id: "user-1",
    organization_id: "org-1",
    permission: 1,
  });

  try {
    const response = await fetch(`${baseUrl}/user/permission/user-3`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        users: 2,
      }),
    });
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error).toBe("Acesso negado para esta rota.");
    expect(body.code).toBe("FORBIDDEN");
    expect(body.requestId).toBeTruthy();
  } finally {
    await stopServer(server);
  }
});

it("strips client-supplied internal auth headers before proxying", async () => {
  const token = createToken({
    user_id: "user-1",
    organization_id: "org-1",
    permission: 2,
    type: "owner",
    modules: { rh: 2 },
  });
  let seenHeaders: {
    internalToken?: string;
    userId?: string;
    organizationId?: string;
    permission?: string;
    type?: string;
    modules?: string;
  } = {};

  const upstream = createServer((request, response) => {
    seenHeaders = {
      internalToken: request.headers[INTERNAL_SERVICE_TOKEN_HEADER] as string | undefined,
      userId: request.headers[FORWARDED_AUTH_USER_ID_HEADER] as string | undefined,
      organizationId: request.headers[FORWARDED_AUTH_ORGANIZATION_ID_HEADER] as string | undefined,
      permission: request.headers[FORWARDED_AUTH_PERMISSION_HEADER] as string | undefined,
      type: request.headers[FORWARDED_AUTH_TYPE_HEADER] as string | undefined,
      modules: request.headers[FORWARDED_AUTH_MODULES_HEADER] as string | undefined,
    };
    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ success: true, data: { ok: true } }));
  });
  const taskServiceUrl = await startServer(upstream);

  const app = createApp(createEnv({ taskServiceUrl }), createTestLogger());
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);

  try {
    const response = await fetch(`${gatewayUrl}/task/list`, {
      headers: {
        Authorization: `Bearer ${token}`,
        [INTERNAL_SERVICE_TOKEN_HEADER]: "client-supplied-token",
        [FORWARDED_AUTH_USER_ID_HEADER]: "attacker-user",
        [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: "attacker-org",
        [FORWARDED_AUTH_PERMISSION_HEADER]: "999",
        [FORWARDED_AUTH_TYPE_HEADER]: "attacker-type",
        [FORWARDED_AUTH_MODULES_HEADER]: JSON.stringify({ rh: 0 }),
      },
    });

    expect(response.status).toBe(200);
    expect(seenHeaders.internalToken).toBeUndefined();
    expect(seenHeaders.userId).toBe("user-1");
    expect(seenHeaders.organizationId).toBe("org-1");
    expect(seenHeaders.permission).toBe("2");
    expect(seenHeaders.type).toBe("owner");
    expect(seenHeaders.modules).toBe(JSON.stringify({ rh: 2 }));
  } finally {
    await stopServer(gateway);
    await stopServer(upstream);
  }
});

it("strips hop-by-hop request headers before proxying", async () => {
  const token = createToken({
    user_id: "user-1",
    organization_id: "org-1",
    permission: 2,
  });
  let seenHeaders: {
    keepAlive?: string;
    customConnectionToken?: string;
  } = {};

  const upstream = createServer((request, response) => {
    seenHeaders = {
      keepAlive: request.headers["keep-alive"] as string | undefined,
      customConnectionToken: request.headers["x-remove-me"] as string | undefined,
    };
    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ success: true, data: { ok: true } }));
  });
  const taskServiceUrl = await startServer(upstream);

  const app = createApp(createEnv({ taskServiceUrl }), createTestLogger());
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);
  const { hostname, port } = new URL(gatewayUrl);

  try {
    const response = await new Promise<{ statusCode: number; body: string }>((resolve, reject) => {
      const request = nodeRequest(
        {
          hostname,
          port,
          path: "/task/list",
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            Connection: "x-remove-me",
            "Keep-Alive": "timeout=5",
            "X-Remove-Me": "client-hop-by-hop",
          },
        },
        (incomingResponse) => {
          const chunks: Buffer[] = [];
          incomingResponse.on("data", (chunk) => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          });
          incomingResponse.on("end", () => {
            resolve({
              statusCode: incomingResponse.statusCode ?? 0,
              body: Buffer.concat(chunks).toString("utf8"),
            });
          });
        },
      );

      request.on("error", reject);
      request.end();
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).success).toBe(true);
    expect(seenHeaders.keepAlive).toBeUndefined();
    expect(seenHeaders.customConnectionToken).toBeUndefined();
  } finally {
    await stopServer(gateway);
    await stopServer(upstream);
  }
});

it("proxies permission updates to the user service when permission is sufficient", async () => {
  const token = createToken({
    user_id: "user-1",
    organization_id: "org-1",
    permission: 2,
  });
  let seenMethod = "";
  let seenUrl = "";

  const upstream = createServer((request, response) => {
    seenMethod = request.method ?? "";
    seenUrl = request.url ?? "";
    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ success: true, data: { updated: true } }));
  });
  const userServiceUrl = await startServer(upstream);

  const app = createApp(createEnv({ userServiceUrl }), createTestLogger());
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);

  try {
    const response = await fetch(`${gatewayUrl}/user/permission/user-3`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        users: 2,
      }),
    });
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(seenMethod).toBe("PUT");
    expect(seenUrl).toBe("/user/permission/user-3");
  } finally {
    await stopServer(gateway);
    await stopServer(upstream);
  }
});

it("returns shared upstream error when the upstream service is unreachable", async () => {
  const app = createApp(
    createEnv({
      userServiceUrl: "http://127.0.0.1:1",
    }),
    createTestLogger(),
  );
  const server = createServer(app);
  const baseUrl = await startServer(server);

  try {
    const response = await fetch(`${baseUrl}/user/session`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ login: "user", password: "secret" }),
    });
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(502);
    expect(body.success).toBe(false);
    expect(body.error).toBe("Erro ao comunicar com o serviço upstream.");
    expect(body.code).toBe("BAD_GATEWAY");
    expect(body.requestId).toBeTruthy();
  } finally {
    await stopServer(server);
  }
});

it("passes upstream error responses through unchanged", async () => {
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
    const response = await fetch(`${gatewayUrl}/user/session`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ login: "user" }),
    });
    const body = (await response.json()) as Record<string, string>;

    expect(response.status).toBe(418);
    expect(body).toEqual({ error: "Teapot upstream" });
  } finally {
    await stopServer(gateway);
    await stopServer(upstream);
  }
});

it("passes upstream non-json error responses through without converting them to bad gateway", async () => {
  const upstreamBody = "<html><body>Not Found</body></html>";
  const upstream = createServer((_request, response) => {
    response.statusCode = 404;
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(upstreamBody);
  });
  const userServiceUrl = await startServer(upstream);

  const app = createApp(createEnv({ userServiceUrl }), createTestLogger());
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);

  try {
    const response = await fetch(`${gatewayUrl}/user/session`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ login: "user" }),
    });
    const body = await response.text();

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(body).toBe(upstreamBody);
  } finally {
    await stopServer(gateway);
    await stopServer(upstream);
  }
});

it("rate limits repeated public login attempts", async () => {
  let upstreamHits = 0;
  const upstream = createServer((_request, response) => {
    upstreamHits += 1;
    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ success: true, data: { token: "ok" } }));
  });
  const userServiceUrl = await startServer(upstream);

  const app = createApp(createEnv({ userServiceUrl }), createTestLogger());
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);

  try {
    for (let index = 0; index < 10; index += 1) {
      const response = await fetch(`${gatewayUrl}/user/session`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ login: "user", password: "secret" }),
      });
      expect(response.status).toBe(200);
    }

    const limited = await fetch(`${gatewayUrl}/user/session`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ login: "user", password: "secret" }),
    });
    const body = (await limited.json()) as Record<string, unknown>;

    expect(limited.status).toBe(429);
    expect(body.code).toBe("TOO_MANY_REQUESTS");
    expect(upstreamHits).toBe(10);
  } finally {
    await stopServer(gateway);
    await stopServer(upstream);
  }
});

it("rejects JSON request bodies above the configured gateway limit before proxying", async () => {
  let upstreamHits = 0;
  const upstream = createServer((_request, response) => {
    upstreamHits += 1;
    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ success: true, data: { token: "ok" } }));
  });
  const userServiceUrl = await startServer(upstream);

  const app = createApp(
    createEnv({
      userServiceUrl,
      jsonBodyLimit: "10b",
    }),
    createTestLogger(),
  );
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);

  try {
    const response = await fetch(`${gatewayUrl}/user/session`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ login: "user", password: "secret" }),
    });
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(413);
    expect(body.success).toBe(false);
    expect(body.code).toBe("PAYLOAD_TOO_LARGE");
    expect(upstreamHits).toBe(0);
  } finally {
    await stopServer(gateway);
    await stopServer(upstream);
  }
});

it("returns the shared success envelope for gateway health", async () => {
  const app = createApp(createEnv(), createTestLogger());
  const server = createServer(app);
  const baseUrl = await startServer(server);

  try {
    const response = await fetch(`${baseUrl}/health`);
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body).toEqual({
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

it("returns the gateway readiness envelope with configured service count", async () => {
  const env = createEnv();
  const app = createApp(env, createTestLogger());
  const server = createServer(app);
  const baseUrl = await startServer(server);

  try {
    const response = await fetch(`${baseUrl}/ready`);
    const body = (await response.json()) as {
      success: boolean;
      data: {
        status: string;
        service: string;
        services: number;
      };
    };

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: {
        status: "ready",
        service: "gateway",
        services: getGatewayServiceDefinitions(env).length,
      },
    });
  } finally {
    await stopServer(server);
  }
});

it("does not apply the general rate limit to gateway infrastructure routes", async () => {
  const app = createApp(
    createEnv({
      rateLimitMax: 1,
      authRateLimitMax: 1,
    }),
    createTestLogger(),
  );
  const server = createServer(app);
  const baseUrl = await startServer(server);

  try {
    const routes = ["/health", "/health", "/ready", "/openapi.json", "/docs/swagger-ui-init.js"];

    for (const route of routes) {
      const response = await fetch(`${baseUrl}${route}`);
      expect(response.status, route).not.toBe(429);
    }
  } finally {
    await stopServer(server);
  }
});

it("does not let unauthenticated attempts exhaust authenticated route rate limits", async () => {
  const token = createToken({
    user_id: "user-1",
    organization_id: "org-1",
    permission: 2,
  });
  const upstream = createServer((_request, response) => {
    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ success: true, data: { ok: true } }));
  });
  const taskServiceUrl = await startServer(upstream);
  const app = createApp(
    createEnv({
      taskServiceUrl,
      rateLimitMax: 1,
      rateLimitWindowMs: 60_000,
    }),
    createTestLogger(),
  );
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);

  try {
    const invalid = await fetch(`${gatewayUrl}/task/list`, {
      headers: { Authorization: "Bearer smoke_invalid_401_test_token" },
    });
    const valid = await fetch(`${gatewayUrl}/task/list`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(invalid.status).toBe(401);
    expect(valid.status).toBe(200);
  } finally {
    await stopServer(gateway);
    await stopServer(upstream);
  }
});

it("serves the aggregated OpenAPI JSON from the gateway", async () => {
  const app = createApp(createEnv(), createTestLogger());
  const server = createServer(app);
  const baseUrl = await startServer(server);

  try {
    const response = await fetch(`${baseUrl}/openapi.json`);
    const body = (await response.json()) as {
      openapi: string;
      info: { description?: string };
      servers?: Array<{ url: string }>;
      paths: Record<string, unknown>;
    };

    expect(response.status).toBe(200);
    expect(body.openapi).toBe("3.0.3");
    expect(body.servers?.[0]?.url).toBe(baseUrl);
    expect(body.info.description).toContain("pessoal-service");
    expect(body.paths["/user"]).toBeTruthy();
    expect(body.paths["/task/list"]).toBeTruthy();
    expect(body.paths["/project/list"]).toBeTruthy();
    expect(body.paths["/client/list"]).toBeTruthy();
    expect(body.paths["/client/commercial/overview"]).toBeUndefined();
    expect(body.paths["/client/{id}/commercial"]).toBeUndefined();
    expect(body.paths["/organizations"]).toBeTruthy();
    expect(body.paths["/rh/point-config"]).toBeTruthy();
    expect(body.paths["/regularize/passwords"]).toBeTruthy();
    expect(body.paths["/fiscal/ncm"]).toBeTruthy();
    expect(body.paths["/contabil/controls"]).toBeTruthy();
    expect(body.paths["/ti/requests/list"]).toBeTruthy();
    expect(body.paths["/certificate/pj/list"]).toBeTruthy();
    expect(body.paths["/certificate/pj/{id}/file"]).toBeTruthy();
    expect(body.paths["/certificate/pf/{id}/file"]).toBeTruthy();
    expect(body.paths["/certificate/notifications"]).toBeTruthy();
    expect(body.paths["/audit/requests"]).toBeTruthy();
    expect(body.paths["/parcelamento/installments"]).toBeUndefined();
    expect(body.paths["/pessoal/health"]).toBeUndefined();
    expect(body.paths["/pessoal/ready"]).toBeUndefined();
    expect(body.paths["/parcelamento/health"]).toBeUndefined();
    expect(body.paths["/parcelamento/ready"]).toBeUndefined();
  } finally {
    await stopServer(server);
  }
});

it("uses the configured public gateway URL in the aggregated OpenAPI JSON", async () => {
  const app = createApp(
    createEnv({
      publicGatewayUrl: "https://api.example.com",
    }),
    createTestLogger(),
  );
  const server = createServer(app);
  const baseUrl = await startServer(server);

  try {
    const response = await fetch(`${baseUrl}/openapi.json`, {
      headers: {
        Host: "unexpected.example",
      },
    });
    const body = (await response.json()) as {
      servers?: Array<{ url: string }>;
    };

    expect(response.status).toBe(200);
    expect(body.servers?.[0]?.url).toBe("https://api.example.com");
  } finally {
    await stopServer(server);
  }
});

it("does not duplicate gateway path prefixes in the aggregated OpenAPI JSON", async () => {
  const app = createApp(createEnv(), createTestLogger());
  const server = createServer(app);
  const baseUrl = await startServer(server);

  try {
    const response = await fetch(`${baseUrl}/openapi.json`);
    const body = (await response.json()) as {
      paths: Record<string, unknown>;
    };

    expect(response.status).toBe(200);
    expect(body.paths["/organizations/organizations"]).toBe(undefined);
    expect(body.paths["/rh/rh/point-config"]).toBe(undefined);
    expect(body.paths["/audit/audit/requests"]).toBe(undefined);
    expect(body.paths["/client/client/list"]).toBe(undefined);
    expect(body.paths["/fiscal/fiscal/ncm"]).toBe(undefined);
    expect(body.paths["/contabil/contabil/controls"]).toBe(undefined);
    expect(body.paths["/ti/ti/requests/list"]).toBe(undefined);
    expect(body.paths["/certificate/certificate/pj/list"]).toBe(undefined);
  } finally {
    await stopServer(server);
  }
});

it("exposes only gateway-relevant auth schemes in the aggregated OpenAPI JSON", async () => {
  const app = createApp(createEnv(), createTestLogger());
  const server = createServer(app);
  const baseUrl = await startServer(server);

  try {
    const response = await fetch(`${baseUrl}/openapi.json`);
    const body = (await response.json()) as {
      components?: {
        securitySchemes?: Record<string, unknown>;
      };
      paths: Record<string, { get?: { security?: Array<Record<string, string[]>> } }>;
    };

    expect(response.status).toBe(200);
    expect(body.components?.securitySchemes?.bearerAuth).toBeTruthy();
    expect(body.components?.securitySchemes?.forwardedAuthUserId).toBe(undefined);
    expect(body.components?.securitySchemes?.internalServiceToken).toBe(undefined);
    expect(body.paths["/user/me"]?.get?.security).toEqual([{ bearerAuth: [] }]);
    expect(body.paths["/user/{id}"]?.get?.security).toEqual([{ bearerAuth: [] }]);
    expect(body.paths["/audit/requests"]?.get?.security).toEqual([{ bearerAuth: [] }]);
    expect(body.paths["/ti/requests/list"]?.get?.security).toEqual([{ bearerAuth: [] }]);
    expect(body.paths["/certificate/pj/list"]?.get?.security).toEqual([{ bearerAuth: [] }]);
    expect(body.paths["/certificate/pj/{id}/file"]?.get?.security).toEqual([{ bearerAuth: [] }]);
  } finally {
    await stopServer(server);
  }
});

it("does not expose service internal notification routes in the aggregated OpenAPI JSON", async () => {
  const app = createApp(createEnv(), createTestLogger());
  const server = createServer(app);
  const baseUrl = await startServer(server);

  try {
    const response = await fetch(`${baseUrl}/openapi.json`);
    const body = (await response.json()) as {
      paths: Record<string, unknown>;
    };

    expect(response.status).toBe(200);
    expect(body.paths["/internal/notifications/run"]).toBe(undefined);
    expect(body.paths["/internal/pessoal/union-notifications/run"]).toBe(undefined);
  } finally {
    await stopServer(server);
  }
});

it("serves Swagger UI from the gateway docs endpoint", async () => {
  const app = createApp(createEnv(), createTestLogger());
  const server = createServer(app);
  const baseUrl = await startServer(server);

  try {
    const response = await fetch(`${baseUrl}/docs`);
    const html = await response.text();
    const initScriptResponse = await fetch(`${baseUrl}/docs/swagger-ui-init.js`);
    const initScript = await initScriptResponse.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(html).toContain("gateway");
    expect(html).toContain('id="swagger-ui"');
    expect(html).toContain("swagger-ui-init.js");
    expect(initScriptResponse.status).toBe(200);
    expect(initScript).toContain("/openapi.json");
  } finally {
    await stopServer(server);
  }
});

it("proxies task-service routes mapped in the gateway", async () => {
  const token = createToken({
    user_id: "user-1",
    organization_id: "org-1",
    permission: 2,
  });
  const taskService = createServer((request, response) => {
    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    response.end(
      JSON.stringify({
        success: true,
        data: { service: "task-service", path: request.url },
      }),
    );
  });
  const taskServiceUrl = await startServer(taskService);

  const app = createApp(createEnv({ taskServiceUrl }), createTestLogger());
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);

  try {
    const response = await fetch(`${gatewayUrl}/task/list`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: { service: "task-service", path: "/task/list" },
    });
  } finally {
    await stopServer(gateway);
    await stopServer(taskService);
  }
});

it("proxies project-service routes mapped in the gateway", async () => {
  const token = createToken({
    user_id: "user-1",
    organization_id: "org-1",
    permission: 2,
  });
  const projectService = createServer((request, response) => {
    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    response.end(
      JSON.stringify({
        success: true,
        data: { service: "project-service", path: request.url },
      }),
    );
  });
  const projectServiceUrl = await startServer(projectService);

  const app = createApp(createEnv({ projectServiceUrl }), createTestLogger());
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);

  try {
    const response = await fetch(`${gatewayUrl}/project/list`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: { service: "project-service", path: "/project/list" },
    });
  } finally {
    await stopServer(gateway);
    await stopServer(projectService);
  }
});

it("proxies organization-service routes mapped in the gateway", async () => {
  const token = createToken({
    user_id: "user-1",
    organization_id: "org-1",
    permission: 2,
  });
  const organizationService = createServer((request, response) => {
    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    response.end(
      JSON.stringify({
        success: true,
        data: { service: "organization-service", path: request.url },
      }),
    );
  });
  const organizationServiceUrl = await startServer(organizationService);

  const app = createApp(createEnv({ organizationServiceUrl }), createTestLogger());
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);

  try {
    const response = await fetch(`${gatewayUrl}/organizations`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: { service: "organization-service", path: "/organizations" },
    });
  } finally {
    await stopServer(gateway);
    await stopServer(organizationService);
  }
});

it("proxies rh-service routes mapped in the gateway", async () => {
  const token = createToken({
    user_id: "user-1",
    organization_id: "org-1",
    permission: 2,
  });
  const rhService = createServer((request, response) => {
    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    response.end(
      JSON.stringify({
        success: true,
        data: { service: "rh-service", path: request.url },
      }),
    );
  });
  const rhServiceUrl = await startServer(rhService);

  const app = createApp(createEnv({ rhServiceUrl }), createTestLogger());
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);

  try {
    const response = await fetch(`${gatewayUrl}/rh/point-config`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: { service: "rh-service", path: "/rh/point-config" },
    });
  } finally {
    await stopServer(gateway);
    await stopServer(rhService);
  }
});

it("proxies ti-service routes mapped in the gateway for global admin level 2", async () => {
  const token = createToken({
    user_id: "user-1",
    organization_id: "org-1",
    permission: 2,
  });
  let seenPermission: string | undefined;
  const tiService = createServer((request, response) => {
    seenPermission = request.headers[FORWARDED_AUTH_PERMISSION_HEADER] as string | undefined;
    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    response.end(
      JSON.stringify({
        success: true,
        data: { service: "ti-service", path: request.url },
      }),
    );
  });
  const tiServiceUrl = await startServer(tiService);

  const app = createApp(createEnv({ tiServiceUrl }), createTestLogger());
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);

  try {
    const response = await fetch(`${gatewayUrl}/ti/requests/list`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: { service: "ti-service", path: "/ti/requests/list" },
    });
    expect(seenPermission).toBe("2");
  } finally {
    await stopServer(gateway);
    await stopServer(tiService);
  }
});

it("forwards modular TI permission instead of global user permission", async () => {
  const token = createToken({
    user_id: "user-1",
    organization_id: "org-1",
    permission: 1,
    modules: { ti: 2 },
  });
  let seenPermission: string | undefined;
  let seenInternalToken: string | undefined;
  const tiService = createServer((request, response) => {
    seenPermission = request.headers[FORWARDED_AUTH_PERMISSION_HEADER] as string | undefined;
    seenInternalToken = request.headers[INTERNAL_SERVICE_TOKEN_HEADER] as string | undefined;
    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ success: true, data: { ok: true } }));
  });
  const tiServiceUrl = await startServer(tiService);

  const app = createApp(
    createEnv({
      tiServiceUrl,
      tiServiceInternalToken: "ti-service-token",
    }),
    createTestLogger(),
  );
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);

  try {
    const response = await fetch(`${gatewayUrl}/ti/requests/list`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    expect(response.status).toBe(200);
    expect(seenPermission).toBe("2");
    expect(seenInternalToken).toBe("ti-service-token");
  } finally {
    await stopServer(gateway);
    await stopServer(tiService);
  }
});

it("proxies certificate-service public routes mapped in the gateway", async () => {
  const token = createToken({
    user_id: "user-1",
    organization_id: "org-1",
    permission: 3,
    modules: { certificado: 1 },
  });
  const seenUrls: string[] = [];
  const certificateService = createServer((request, response) => {
    seenUrls.push(request.url ?? "");
    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    response.end(
      JSON.stringify({
        success: true,
        data: { service: "certificate-service", path: request.url },
      }),
    );
  });
  const certificateServiceUrl = await startServer(certificateService);

  const app = createApp(createEnv({ certificateServiceUrl }), createTestLogger());
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);

  try {
    const pjResponse = await fetch(`${gatewayUrl}/certificate/pj/list`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const notificationResponse = await fetch(`${gatewayUrl}/certificate/notifications`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const pjBody = (await pjResponse.json()) as Record<string, unknown>;
    const notificationBody = (await notificationResponse.json()) as Record<string, unknown>;

    expect(pjResponse.status).toBe(200);
    expect(notificationResponse.status).toBe(200);
    expect(pjBody).toEqual({
      success: true,
      data: { service: "certificate-service", path: "/certificate/pj/list" },
    });
    expect(notificationBody).toEqual({
      success: true,
      data: { service: "certificate-service", path: "/certificate/notifications" },
    });
    expect(seenUrls).toEqual(["/certificate/pj/list", "/certificate/notifications"]);
  } finally {
    await stopServer(gateway);
    await stopServer(certificateService);
  }
});

it("proxies pessoal-service routes mapped in the gateway", async () => {
  const token = createToken({
    user_id: "user-1",
    organization_id: "org-1",
    permission: 3,
    modules: { pessoal: 1 },
  });
  const seenUrls: string[] = [];
  const pessoalService = createServer((request, response) => {
    seenUrls.push(request.url ?? "");
    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    response.end(
      JSON.stringify({
        success: true,
        data: { service: "pessoal-service", path: request.url },
      }),
    );
  });
  const pessoalServiceUrl = await startServer(pessoalService);

  const app = createApp(createEnv({ pessoalServiceUrl }), createTestLogger());
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);

  try {
    const response = await fetch(`${gatewayUrl}/pessoal/health-proxy-test`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(seenUrls).toEqual(["/pessoal/health-proxy-test"]);
  } finally {
    await stopServer(gateway);
    await stopServer(pessoalService);
  }
});

it("blocks /parcelamento before proxying even for global admins", async () => {
  const token = createToken({
    user_id: "user-1",
    organization_id: "org-1",
    permission: 2,
    modules: { parcelamento: 2 },
  });
  let upstreamHits = 0;
  const parcelamentoService = createServer((_request, response) => {
    upstreamHits += 1;
    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ success: true, data: { ok: true } }));
  });
  const parcelamentoServiceUrl = await startServer(parcelamentoService);

  const app = createApp(createEnv({ parcelamentoServiceUrl }), createTestLogger());
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);

  try {
    const response = await fetch(`${gatewayUrl}/parcelamento/installments`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(404);
    expect(body.code).toBe("NOT_FOUND");
    expect(upstreamHits).toBe(0);
  } finally {
    await stopServer(gateway);
    await stopServer(parcelamentoService);
  }
});

it("forwards modular certificate permission and internal token to certificate-service", async () => {
  const token = createToken({
    user_id: "user-1",
    organization_id: "org-1",
    permission: 3,
    modules: { certificado: 1 },
  });
  let seenPermission: string | undefined;
  let seenInternalToken: string | undefined;
  const certificateService = createServer((request, response) => {
    seenPermission = request.headers[FORWARDED_AUTH_PERMISSION_HEADER] as string | undefined;
    seenInternalToken = request.headers[INTERNAL_SERVICE_TOKEN_HEADER] as string | undefined;
    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ success: true, data: { ok: true } }));
  });
  const certificateServiceUrl = await startServer(certificateService);

  const app = createApp(
    createEnv({
      certificateServiceUrl,
      certificateServiceInternalToken: "certificate-service-token",
    }),
    createTestLogger(),
  );
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);

  try {
    const response = await fetch(`${gatewayUrl}/certificate/pj/list`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    expect(response.status).toBe(200);
    expect(seenPermission).toBe("1");
    expect(seenInternalToken).toBe("certificate-service-token");
  } finally {
    await stopServer(gateway);
    await stopServer(certificateService);
  }
});

it("forwards elevated certificate permission for global admins without modular certificate permission", async () => {
  const token = createToken({
    user_id: "user-1",
    organization_id: "org-1",
    permission: 2,
    modules: { certificado: null },
  });
  let seenPermission: string | undefined;
  const certificateService = createServer((request, response) => {
    seenPermission = request.headers[FORWARDED_AUTH_PERMISSION_HEADER] as string | undefined;
    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ success: true, data: { ok: true } }));
  });
  const certificateServiceUrl = await startServer(certificateService);

  const app = createApp(createEnv({ certificateServiceUrl }), createTestLogger());
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);

  try {
    const response = await fetch(`${gatewayUrl}/certificate/pj/list`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    expect(response.status).toBe(200);
    expect(seenPermission).toBe("2");
  } finally {
    await stopServer(gateway);
    await stopServer(certificateService);
  }
});

it("does not forward certificate permission for non-admin users without modular certificate permission", async () => {
  const token = createToken({
    user_id: "user-1",
    organization_id: "org-1",
    permission: 1,
  });
  let seenPermission: string | undefined;
  const certificateService = createServer((request, response) => {
    seenPermission = request.headers[FORWARDED_AUTH_PERMISSION_HEADER] as string | undefined;
    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ success: true, data: { ok: true } }));
  });
  const certificateServiceUrl = await startServer(certificateService);

  const app = createApp(createEnv({ certificateServiceUrl }), createTestLogger());
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);

  try {
    const response = await fetch(`${gatewayUrl}/certificate/pj/list`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    expect(response.status).toBe(200);
    expect(seenPermission).toBeUndefined();
  } finally {
    await stopServer(gateway);
    await stopServer(certificateService);
  }
});

it("does not expose certificate internal notification routes through the gateway", async () => {
  const token = createToken({
    user_id: "user-1",
    organization_id: "org-1",
    permission: 3,
    modules: { certificado: 2 },
  });
  const app = createApp(createEnv(), createTestLogger());
  const server = createServer(app);
  const baseUrl = await startServer(server);

  try {
    const response = await fetch(`${baseUrl}/internal/notifications/run`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({}),
    });
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error).toBe("Rota não mapeada no gateway.");
  } finally {
    await stopServer(server);
  }
});

it("returns 404 for routes not mapped to any upstream", async () => {
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

    expect(response.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error).toBe("Rota não mapeada no gateway.");
  } finally {
    await stopServer(server);
  }
});

it("requires authentication before blocking regularize internal routes", async () => {
  const app = createApp(createEnv(), createTestLogger());
  const server = createServer(app);
  const baseUrl = await startServer(server);

  try {
    const response = await fetch(`${baseUrl}/regularize/internal/status`);
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.code).toBe("UNAUTHORIZED");
  } finally {
    await stopServer(server);
  }
});

it("returns 404 for authenticated regularize internal routes without proxying", async () => {
  const token = createToken({
    user_id: "user-1",
    organization_id: "org-1",
    permission: 2,
  });
  let upstreamHits = 0;
  const upstream = createServer((_request, response) => {
    upstreamHits += 1;
    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ success: true, data: { ok: true } }));
  });
  const regularizeServiceUrl = await startServer(upstream);

  const app = createApp(createEnv({ regularizeServiceUrl }), createTestLogger());
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);

  try {
    const response = await fetch(`${gatewayUrl}/regularize/internal/status`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error).toBe("Recurso não encontrado.");
    expect(upstreamHits).toBe(0);
  } finally {
    await stopServer(gateway);
    await stopServer(upstream);
  }
});

it("returns 404 for audit routes when the feature flag is disabled", async () => {
  const app = createApp(createEnv(), createTestLogger());
  const server = createServer(app);
  const baseUrl = await startServer(server);

  try {
    const response = await fetch(`${baseUrl}/audit/requests`);
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(404);
    expect(body.error).toBe("Recurso não encontrado.");
  } finally {
    await stopServer(server);
  }
});

it("proxies audit routes to the audit service when the feature flag is enabled", async () => {
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

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(seenHeaders.internalToken).toBe("audit-service-token");
    expect(seenHeaders.userId).toBe("user-1");
    expect(seenHeaders.organizationId).toBe("org-1");
  } finally {
    await stopServer(gateway);
    await stopServer(auditService);
  }
});

it("records successful proxied requests when audit is enabled", async () => {
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
  const taskServiceUrl = await startServer(upstream);

  const app = createApp(
    createEnv({
      auditEnabled: true,
      auditServiceUrl: auditService.url,
      taskServiceUrl,
    }),
    createTestLogger(),
  );
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);

  try {
    const response = await fetch(`${gatewayUrl}/task/list?page=2`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    expect(response.status).toBe(200);

    await waitForRecords(auditService.records, 1);

    expect(auditService.records.length).toBe(1);
    expect(auditService.records[0]?.requestId.length > 0).toBe(true);
    expect(auditService.records[0]?.organizationId).toBe("org-1");
    expect(auditService.records[0]?.userId).toBe("user-1");
    expect(auditService.records[0]).toMatchObject({
      method: "GET",
      path: "/task/list",
      query: { page: "2" },
      outcome: "success",
      action: "consultou",
      referring: "a lista de tarefas",
      metadata: {
        routeTarget: "task-service",
        activityVisible: true,
      },
    });
  } finally {
    await stopServer(gateway);
    await stopServer(upstream);
    await stopServer(auditService.server);
  }
});

it("records semantic task activity when an authenticated upstream request fails", async () => {
  const token = createToken({
    user_id: "user-1",
    organization_id: "org-1",
    permission: 2,
  });
  const auditService = await startAuditIngestServer();
  const upstream = createServer((_request, response) => {
    response.statusCode = 500;
    response.end();
  });
  const taskServiceUrl = await startServer(upstream);
  const app = createApp(
    createEnv({
      auditEnabled: true,
      auditServiceUrl: auditService.url,
      taskServiceUrl,
    }),
    createTestLogger(),
  );
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);

  try {
    const response = await fetch(`${gatewayUrl}/task/list`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(500);

    await waitForRecords(auditService.records, 1);

    expect(auditService.records[0]).toMatchObject({
      outcome: "error",
      action: "consultou",
      referring: "a lista de tarefas",
      metadata: { activityVisible: true },
    });
  } finally {
    await stopServer(gateway);
    await stopServer(upstream);
    await stopServer(auditService.server);
  }
});

it("records organization-service route targets when audit is enabled", async () => {
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
  const organizationServiceUrl = await startServer(upstream);

  const app = createApp(
    createEnv({
      auditEnabled: true,
      auditServiceUrl: auditService.url,
      organizationServiceUrl,
    }),
    createTestLogger(),
  );
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);

  try {
    const response = await fetch(`${gatewayUrl}/organizations`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    expect(response.status).toBe(200);

    await waitForRecords(auditService.records, 1);

    expect(auditService.records[0]?.metadata?.routeTarget).toBe("organization-service");
  } finally {
    await stopServer(gateway);
    await stopServer(upstream);
    await stopServer(auditService.server);
  }
});

it("records ti-service route targets when audit is enabled", async () => {
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
  const tiServiceUrl = await startServer(upstream);

  const app = createApp(
    createEnv({
      auditEnabled: true,
      auditServiceUrl: auditService.url,
      tiServiceUrl,
    }),
    createTestLogger(),
  );
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);

  try {
    const response = await fetch(`${gatewayUrl}/ti/requests/list`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    expect(response.status).toBe(200);

    await waitForRecords(auditService.records, 1);

    expect(auditService.records[0]?.metadata?.routeTarget).toBe("ti-service");
  } finally {
    await stopServer(gateway);
    await stopServer(upstream);
    await stopServer(auditService.server);
  }
});

it("records certificate-service route targets when audit is enabled", async () => {
  const token = createToken({
    user_id: "user-1",
    organization_id: "org-1",
    permission: 3,
    modules: { certificado: 1 },
  });
  const auditService = await startAuditIngestServer();
  const upstream = createServer((_request, response) => {
    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ ok: true }));
  });
  const certificateServiceUrl = await startServer(upstream);

  const app = createApp(
    createEnv({
      auditEnabled: true,
      auditServiceUrl: auditService.url,
      certificateServiceUrl,
    }),
    createTestLogger(),
  );
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);

  try {
    const response = await fetch(`${gatewayUrl}/certificate/pj/list`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    expect(response.status).toBe(200);

    await waitForRecords(auditService.records, 1);

    expect(auditService.records[0]?.metadata?.routeTarget).toBe("certificate-service");
  } finally {
    await stopServer(gateway);
    await stopServer(upstream);
    await stopServer(auditService.server);
  }
});

it("records pessoal-service route targets when audit is enabled", async () => {
  const token = createToken({
    user_id: "user-1",
    organization_id: "org-1",
    permission: 3,
    modules: { pessoal: 1 },
  });
  const auditService = await startAuditIngestServer();
  const upstream = createServer((_request, response) => {
    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ ok: true }));
  });
  const pessoalServiceUrl = await startServer(upstream);

  const app = createApp(
    createEnv({
      auditEnabled: true,
      auditServiceUrl: auditService.url,
      pessoalServiceUrl,
    }),
    createTestLogger(),
  );
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);

  try {
    const response = await fetch(`${gatewayUrl}/pessoal/health-proxy-test`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    expect(response.status).toBe(200);

    await waitForRecords(auditService.records, 1);

    expect(auditService.records[0]?.metadata?.routeTarget).toBe("pessoal-service");
  } finally {
    await stopServer(gateway);
    await stopServer(upstream);
    await stopServer(auditService.server);
  }
});

it("does not record parcelamento-service route targets when disabled", async () => {
  const token = createToken({
    user_id: "user-1",
    organization_id: "org-1",
    permission: 3,
    modules: { parcelamento: 2 },
  });
  const auditService = await startAuditIngestServer();
  let upstreamHits = 0;
  const upstream = createServer((_request, response) => {
    upstreamHits += 1;
    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ ok: true }));
  });
  const parcelamentoServiceUrl = await startServer(upstream);

  const app = createApp(
    createEnv({
      auditEnabled: true,
      auditServiceUrl: auditService.url,
      parcelamentoServiceUrl,
    }),
    createTestLogger(),
  );
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);

  try {
    const response = await fetch(`${gatewayUrl}/parcelamento/installments`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    expect(response.status).toBe(404);
    expect(upstreamHits).toBe(0);
    expect(auditService.records).toHaveLength(0);
  } finally {
    await stopServer(gateway);
    await stopServer(upstream);
    await stopServer(auditService.server);
  }
});

it("records unauthorized requests when audit is enabled", async () => {
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
    const response = await fetch(`${gatewayUrl}/user`);

    expect(response.status).toBe(401);

    await waitForRecords(auditService.records, 1);

    expect(auditService.records.length).toBe(1);
    expect(auditService.records[0]?.statusCode).toBe(401);
    expect(auditService.records[0]?.outcome).toBe("error");
    expect(auditService.records[0]?.errorCode).toBe("UNAUTHORIZED");
    expect(auditService.records[0]?.userId).toBe(undefined);
  } finally {
    await stopServer(gateway);
    await stopServer(auditService.server);
  }
});

it("records bad gateway failures when audit is enabled", async () => {
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
    const response = await fetch(`${gatewayUrl}/user/session`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ login: "user" }),
    });

    expect(response.status).toBe(502);

    await waitForRecords(auditService.records, 1);

    expect(auditService.records.length).toBe(1);
    expect(auditService.records[0]?.statusCode).toBe(502);
    expect(auditService.records[0]?.outcome).toBe("error");
    expect(auditService.records[0]?.errorCode).toBe("BAD_GATEWAY");
    expect(auditService.records[0]?.metadata?.activityVisible).toBe(false);
    expect(auditService.records[0]?.action).toBe(undefined);
    expect(auditService.records[0]?.referring).toBe(undefined);
  } finally {
    await stopServer(gateway);
    await stopServer(auditService.server);
  }
});

it("records aborted requests when audit is enabled", async () => {
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
          path: "/user",
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

    expect(auditService.records.length).toBe(1);
    expect(auditService.records[0]?.statusCode).toBe(499);
    expect(auditService.records[0]?.outcome).toBe("aborted");
  } finally {
    await stopServer(gateway);
    await stopServer(upstream);
    await stopServer(auditService.server);
  }
});

it("logs completed requests with status, duration, auth context, and response size", async () => {
  const token = createToken({
    user_id: "user-1",
    organization_id: "org-1",
    permission: 2,
  });
  const upstreamBody = JSON.stringify({ success: true, data: { ok: true } });
  const upstream = createServer((_request, response) => {
    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    response.setHeader("content-length", String(Buffer.byteLength(upstreamBody)));
    response.end(upstreamBody);
  });
  const taskServiceUrl = await startServer(upstream);
  const { logger, stream } = createCapturedTestLogger();
  const app = createApp(createEnv({ taskServiceUrl }), logger);
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);

  try {
    const response = await fetch(`${gatewayUrl}/task/list`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    expect(response.status).toBe(200);
    await response.arrayBuffer();
    await waitForLogs();

    const completedLogs = stream
      .entries()
      .filter((entry) => entry.event === "http.request.completed");
    expect(completedLogs).toHaveLength(1);

    const completedLog = completedLogs[0] as {
      auth?: Record<string, unknown>;
      http?: Record<string, unknown>;
    };

    expect(completedLog.auth).toEqual({
      userId: "user-1",
      organizationId: "org-1",
      permission: 2,
    });
    expect(completedLog.http?.statusCode).toBe(200);
    expect(completedLog.http?.durationMs).toEqual(expect.any(Number));
    expect(completedLog.http?.responseSizeBytes).toBe(Buffer.byteLength(upstreamBody));
  } finally {
    await stopServer(gateway);
    await stopServer(upstream);
  }
});

it("logs aborted requests exactly once", async () => {
  const token = createToken({
    user_id: "user-1",
    organization_id: "org-1",
    permission: 2,
  });
  const upstream = createServer((_request, response) => {
    setTimeout(() => {
      if (!response.headersSent) {
        response.statusCode = 200;
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({ success: true, data: { ok: true } }));
      }
    }, 100);
  });
  const taskServiceUrl = await startServer(upstream);
  const { logger, stream } = createCapturedTestLogger();
  const app = createApp(createEnv({ taskServiceUrl }), logger);
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);
  const { hostname, port } = new URL(gatewayUrl);

  try {
    await new Promise<void>((resolve) => {
      const request = nodeRequest(
        {
          hostname,
          port,
          path: "/task/list",
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
    await waitForLogs();

    const abortedLogs = stream.entries().filter((entry) => entry.event === "http.request.aborted");
    expect(abortedLogs).toHaveLength(1);
  } finally {
    await stopServer(gateway);
    await stopServer(upstream);
  }
});

it("does not change responses when audit ingestion fails", async () => {
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

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
  } finally {
    await stopServer(gateway);
  }
});

it("proxies /user/me to the user service with forwarded auth headers", async () => {
  const token = createToken({
    user_id: "user-1",
    organization_id: "org-1",
    permission: 2,
  });
  let seenUrl = "";

  const upstream = createServer((request, response) => {
    seenUrl = request.url ?? "";
    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ success: true, data: { userId: "user-1" } }));
  });
  const userServiceUrl = await startServer(upstream);

  const app = createApp(createEnv({ userServiceUrl }), createTestLogger());
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);

  try {
    const response = await fetch(`${gatewayUrl}/user/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(seenUrl.startsWith("/user/me")).toBe(true);
  } finally {
    await stopServer(gateway);
    await stopServer(upstream);
  }
});

it("proxies /organizations to the organization microservice", async () => {
  const token = createToken({
    user_id: "user-1",
    organization_id: "org-1",
    permission: 2,
  });
  let seenUrl = "";

  const upstream = createServer((request, response) => {
    seenUrl = request.url ?? "";
    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ success: true, data: { proxied: true } }));
  });
  const organizationServiceUrl = await startServer(upstream);

  const app = createApp(createEnv({ organizationServiceUrl }), createTestLogger());
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);

  try {
    const response = await fetch(`${gatewayUrl}/organizations/smoke`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(seenUrl).toBe("/organizations/smoke");
  } finally {
    await stopServer(gateway);
    await stopServer(upstream);
  }
});

it("proxies /client to the client microservice", async () => {
  const token = createToken({
    user_id: "user-1",
    organization_id: "org-1",
    permission: 2,
  });
  let seenUrl = "";

  const upstream = createServer((request, response) => {
    seenUrl = request.url ?? "";
    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ success: true, data: { proxied: true } }));
  });
  const clientServiceUrl = await startServer(upstream);

  const app = createApp(createEnv({ clientServiceUrl }), createTestLogger());
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);

  try {
    const response = await fetch(`${gatewayUrl}/client/smoke`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(seenUrl).toBe("/client/smoke");
  } finally {
    await stopServer(gateway);
    await stopServer(upstream);
  }
});

it("blocks disabled commercial routes before proxying even for global admins", async () => {
  const token = createToken({
    user_id: "user-1",
    organization_id: "org-1",
    permission: 2,
    modules: { comercial: 2 },
  });
  const seenUrls: string[] = [];
  const upstream = createServer((request, response) => {
    seenUrls.push(request.url ?? "");
    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ success: true, data: { ok: true } }));
  });
  const clientServiceUrl = await startServer(upstream);
  const app = createApp(createEnv({ clientServiceUrl }), createTestLogger());
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);

  try {
    const responses = await Promise.all([
      fetch(`${gatewayUrl}/client/commercial/overview`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      fetch(`${gatewayUrl}/client/client-1/commercial`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ prospecting_status: "Prospect" }),
      }),
    ]);

    for (const response of responses) {
      const body = (await response.json()) as Record<string, unknown>;
      expect(response.status).toBe(404);
      expect(body.code).toBe("NOT_FOUND");
    }

    expect(seenUrls).toEqual([]);
  } finally {
    await stopServer(gateway);
    await stopServer(upstream);
  }
});

it("blocks limited users without client-related module permission before proxying /client", async () => {
  const token = createToken({
    user_id: "user-1",
    organization_id: "org-1",
    permission: 1,
    modules: {
      atendimento: 0,
      comercial: 0,
      contabil: 0,
      financeiro: 0,
      fiscal: 0,
      integracao: 0,
      pessoal: 0,
      regularize: 0,
    },
  });
  let upstreamHits = 0;

  const upstream = createServer((_request, response) => {
    upstreamHits += 1;
    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ success: true, data: { proxied: true } }));
  });
  const clientServiceUrl = await startServer(upstream);

  const app = createApp(createEnv({ clientServiceUrl }), createTestLogger());
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);

  try {
    const response = await fetch(`${gatewayUrl}/client/list`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(403);
    expect(body.code).toBe("FORBIDDEN");
    expect(upstreamHits).toBe(0);
  } finally {
    await stopServer(gateway);
    await stopServer(upstream);
  }
});

it("allows limited users with client-related module permission to proxy /client", async () => {
  const token = createToken({
    user_id: "user-1",
    organization_id: "org-1",
    permission: 1,
    modules: { integracao: 1 },
  });
  let seenUrl = "";

  const upstream = createServer((request, response) => {
    seenUrl = request.url ?? "";
    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ success: true, data: { proxied: true } }));
  });
  const clientServiceUrl = await startServer(upstream);

  const app = createApp(createEnv({ clientServiceUrl }), createTestLogger());
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);

  try {
    const response = await fetch(`${gatewayUrl}/client/list`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(200);
    expect(seenUrl).toBe("/client/list");
  } finally {
    await stopServer(gateway);
    await stopServer(upstream);
  }
});

it("proxies /rh to the rh microservice", async () => {
  const token = createToken({
    user_id: "user-1",
    organization_id: "org-1",
    permission: 2,
  });
  let seenUrl = "";

  const upstream = createServer((request, response) => {
    seenUrl = request.url ?? "";
    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ success: true, data: { proxied: true } }));
  });
  const rhServiceUrl = await startServer(upstream);

  const app = createApp(createEnv({ rhServiceUrl }), createTestLogger());
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);

  try {
    const response = await fetch(`${gatewayUrl}/rh/smoke`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(seenUrl).toBe("/rh/smoke");
  } finally {
    await stopServer(gateway);
    await stopServer(upstream);
  }
});

it("blocks limited users without RH module permission before proxying /rh", async () => {
  const token = createToken({
    user_id: "user-1",
    organization_id: "org-1",
    permission: 1,
    modules: { rh: 0 },
  });
  let upstreamHits = 0;

  const upstream = createServer((_request, response) => {
    upstreamHits += 1;
    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ success: true, data: { proxied: true } }));
  });
  const rhServiceUrl = await startServer(upstream);

  const app = createApp(createEnv({ rhServiceUrl }), createTestLogger());
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);

  try {
    const response = await fetch(`${gatewayUrl}/rh/requests`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(403);
    expect(body.code).toBe("FORBIDDEN");
    expect(upstreamHits).toBe(0);
  } finally {
    await stopServer(gateway);
    await stopServer(upstream);
  }
});

it("allows limited users with RH module permission to proxy /rh", async () => {
  const token = createToken({
    user_id: "user-1",
    organization_id: "org-1",
    permission: 1,
    modules: { rh: 1 },
  });
  let seenUrl = "";

  const upstream = createServer((request, response) => {
    seenUrl = request.url ?? "";
    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ success: true, data: { proxied: true } }));
  });
  const rhServiceUrl = await startServer(upstream);

  const app = createApp(createEnv({ rhServiceUrl }), createTestLogger());
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);

  try {
    const response = await fetch(`${gatewayUrl}/rh/requests`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(200);
    expect(seenUrl).toBe("/rh/requests");
  } finally {
    await stopServer(gateway);
    await stopServer(upstream);
  }
});

it("requires authentication before proxying /pessoal", async () => {
  let upstreamHits = 0;

  const upstream = createServer((_request, response) => {
    upstreamHits += 1;
    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ success: true, data: { proxied: true } }));
  });
  const pessoalServiceUrl = await startServer(upstream);

  const app = createApp(createEnv({ pessoalServiceUrl }), createTestLogger());
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);

  try {
    const response = await fetch(`${gatewayUrl}/pessoal/unions`);
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(401);
    expect(body.code).toBe("UNAUTHORIZED");
    expect(upstreamHits).toBe(0);
  } finally {
    await stopServer(gateway);
    await stopServer(upstream);
  }
});

it("forwards RH module permission to rh-service", async () => {
  const token = createToken({
    user_id: "user-1",
    organization_id: "org-1",
    permission: 1,
    modules: { rh: 2 },
  });
  let seenPermission: string | undefined;

  const upstream = createServer((request, response) => {
    seenPermission = request.headers[FORWARDED_AUTH_PERMISSION_HEADER] as string | undefined;
    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ success: true, data: { proxied: true } }));
  });
  const rhServiceUrl = await startServer(upstream);

  const app = createApp(createEnv({ rhServiceUrl }), createTestLogger());
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);

  try {
    const response = await fetch(`${gatewayUrl}/rh/requests`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(200);
    expect(seenPermission).toBe("2");
  } finally {
    await stopServer(gateway);
    await stopServer(upstream);
  }
});

it("blocks limited users without pessoal module permission before proxying /pessoal", async () => {
  const token = createToken({
    user_id: "user-1",
    organization_id: "org-1",
    permission: 1,
    modules: { pessoal: 0 },
  });
  let upstreamHits = 0;

  const upstream = createServer((_request, response) => {
    upstreamHits += 1;
    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ success: true, data: { proxied: true } }));
  });
  const pessoalServiceUrl = await startServer(upstream);

  const app = createApp(createEnv({ pessoalServiceUrl }), createTestLogger());
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);

  try {
    const response = await fetch(`${gatewayUrl}/pessoal/unions`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(403);
    expect(body.code).toBe("FORBIDDEN");
    expect(upstreamHits).toBe(0);
  } finally {
    await stopServer(gateway);
    await stopServer(upstream);
  }
});

it("allows limited users with pessoal module permission to proxy /pessoal", async () => {
  const token = createToken({
    user_id: "user-1",
    organization_id: "org-1",
    permission: 1,
    modules: { pessoal: 1 },
  });
  let seenUrl = "";

  const upstream = createServer((request, response) => {
    seenUrl = request.url ?? "";
    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ success: true, data: { proxied: true } }));
  });
  const pessoalServiceUrl = await startServer(upstream);

  const app = createApp(createEnv({ pessoalServiceUrl }), createTestLogger());
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);

  try {
    const response = await fetch(`${gatewayUrl}/pessoal/unions`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(200);
    expect(seenUrl).toBe("/pessoal/unions");
  } finally {
    await stopServer(gateway);
    await stopServer(upstream);
  }
});

it("proxies /regularize to the regularize microservice", async () => {
  const token = createToken({
    user_id: "user-1",
    organization_id: "org-1",
    permission: 2,
  });
  let seenUrl = "";

  const upstream = createServer((request, response) => {
    seenUrl = request.url ?? "";
    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ success: true, data: { proxied: true } }));
  });
  const regularizeServiceUrl = await startServer(upstream);

  const app = createApp(createEnv({ regularizeServiceUrl }), createTestLogger());
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);

  try {
    const response = await fetch(`${gatewayUrl}/regularize/smoke`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(seenUrl).toBe("/regularize/smoke");
  } finally {
    await stopServer(gateway);
    await stopServer(upstream);
  }
});

it("proxies task-service paths from the gateway", async () => {
  const token = createToken({
    user_id: "user-1",
    organization_id: "org-1",
    permission: 2,
  });
  let seenUrl = "";

  const upstream = createServer((request, response) => {
    seenUrl = request.url ?? "";
    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ success: true, data: { task: true } }));
  });
  const taskServiceUrl = await startServer(upstream);

  const app = createApp(createEnv({ taskServiceUrl }), createTestLogger());
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);

  try {
    const response = await fetch(`${gatewayUrl}/task/list`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(seenUrl).toBe("/task/list");
  } finally {
    await stopServer(gateway);
    await stopServer(upstream);
  }
});

it("returns bad request for malformed JSON before proxying", async () => {
  let upstreamHits = 0;
  const upstream = createServer((_request, response) => {
    upstreamHits += 1;
    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ success: true, data: { token: "ok" } }));
  });
  const userServiceUrl = await startServer(upstream);

  const app = createApp(createEnv({ userServiceUrl }), createTestLogger());
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);

  try {
    const response = await fetch(`${gatewayUrl}/user/session`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: "{",
    });
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe("JSON malformado.");
    expect(body.code).toBe("BAD_REQUEST");
    expect(body.requestId).toBeTruthy();
    expect(upstreamHits).toBe(0);
  } finally {
    await stopServer(gateway);
    await stopServer(upstream);
  }
});
