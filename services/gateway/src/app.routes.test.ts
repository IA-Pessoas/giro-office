import { once } from "node:events";
import { createServer, type IncomingMessage, request as nodeRequest, type Server } from "node:http";

import type { CreateAuditRequestPayload } from "@workspace/shared";
import {
  createLogger,
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
} from "@workspace/shared";
import { MemoryLogStream } from "@workspace/shared/testUtils";
import jwt from "jsonwebtoken";
import { expect, it } from "vitest";

import { createApp } from "./app.js";
import type { GatewayEnv } from "./config/env.js";

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

it("serves the aggregated OpenAPI JSON from the gateway", async () => {
  const app = createApp(createEnv(), createTestLogger());
  const server = createServer(app);
  const baseUrl = await startServer(server);

  try {
    const response = await fetch(`${baseUrl}/openapi.json`);
    const body = (await response.json()) as {
      openapi: string;
      servers?: Array<{ url: string }>;
      paths: Record<string, unknown>;
    };

    expect(response.status).toBe(200);
    expect(body.openapi).toBe("3.0.3");
    expect(body.servers?.[0]?.url).toBe(baseUrl);
    expect(body.paths["/user"]).toBeTruthy();
    expect(body.paths["/task/list"]).toBeTruthy();
    expect(body.paths["/project/list"]).toBeTruthy();
    expect(body.paths["/client/list"]).toBeTruthy();
    expect(body.paths["/organizations"]).toBeTruthy();
    expect(body.paths["/rh/point-config"]).toBeTruthy();
    expect(body.paths["/fiscal/ncm"]).toBeTruthy();
    expect(body.paths["/contabil/controls"]).toBeTruthy();
    expect(body.paths["/audit/requests"]).toBeTruthy();
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
    const response = await fetch(`${gatewayUrl}/user`, {
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
    expect(auditService.records[0]?.statusCode).toBe(200);
    expect(auditService.records[0]?.outcome).toBe("success");
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
