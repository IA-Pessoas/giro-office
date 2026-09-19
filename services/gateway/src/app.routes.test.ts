import { once } from "node:events";
import { createServer, type IncomingMessage, request as nodeRequest, type Server } from "node:http";
import { Writable } from "node:stream";

import type { CreateAuditRequestPayload } from "@workspace/shared";
import {
  CSRF_HEADER_NAME,
  createLogger,
  FORWARDED_AUTH_KIND_HEADER,
  FORWARDED_AUTH_MODULES_HEADER,
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_PERMISSION_HEADER,
  FORWARDED_AUTH_PLATFORM_ROLE_HEADER,
  FORWARDED_AUTH_TYPE_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  hashCsrfToken,
  INTERNAL_SERVICE_TOKEN_HEADER,
} from "@workspace/shared";
import express from "express";
import jwt from "jsonwebtoken";
import { expect, it, vi } from "vitest";

import { isAuthenticated as authenticateDepartment } from "../../department-service/src/middlewares/isAuthenticated.js";
import { isAuthenticated as authenticateRh } from "../../rh-service/src/middlewares/isAuthenticated.js";
import { createApp } from "./app.js";
import { getGatewayServiceDefinitions } from "./config/serviceRegistry.js";
import {
  createTestEnv as createEnv,
  createTestLogger,
  startServer,
  stopServer,
} from "./test/gatewayTestUtils.js";

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

function createCapturedTestLogger() {
  const stream = new CapturingLogStream();
  const logger = createLogger({
    service: "gateway-test",
    env: "test",
    destination: stream,
  });

  return { logger, stream };
}

it("autentica as quatro consultas de RH com cookie nos middlewares reais dos upstreams", async () => {
  vi.stubEnv("JWT_SECRET", "test-secret");
  vi.stubEnv("DATABASE_URL", "postgres://test:test@127.0.0.1:5432/test");
  vi.stubEnv("NODE_ENV", "test");
  const upstream = express();
  upstream.use("/rh", authenticateRh);
  upstream.use("/department", authenticateDepartment);
  upstream.use((request, response) => {
    response.json({
      success: true,
      data: { userId: request.user_id, organizationId: request.organization_id },
    });
  });
  upstream.use(
    (
      error: Error,
      _request: express.Request,
      response: express.Response,
      _next: express.NextFunction,
    ) => {
      response.status(401).json({ success: false, error: error.message });
    },
  );
  const upstreamServer = createServer(upstream);
  const upstreamUrl = await startServer(upstreamServer);
  const app = createApp(
    createEnv({ rhServiceUrl: upstreamUrl, departmentServiceUrl: upstreamUrl }),
    createTestLogger(),
  );
  const server = createServer(app);
  const url = await startServer(server);
  const token = jwt.sign(
    {
      user_id: "rh-user",
      organization_id: "rh-org",
      permission: 1,
      type: "user",
      modules: { rh: 3, ti: 1 },
    },
    "test-secret",
    { expiresIn: "5m" },
  );
  try {
    for (const path of [
      "/rh/requests",
      "/rh/score/evaluations/pending",
      "/rh/timesheets",
      "/department/list",
    ]) {
      const response = await fetch(`${url}${path}`, {
        headers: { cookie: `cw.session=${token}`, authorization: "Bearer untrusted-browser-token" },
      });
      expect(await response.json(), path).toEqual({
        success: true,
        data: { userId: "rh-user", organizationId: "rh-org" },
      });
      expect(response.status).toBe(200);
    }
    const anonymous = await fetch(`${url}/rh/requests`);
    expect(anonymous.status).toBe(401);
    const noRhToken = jwt.sign(
      {
        user_id: "rh-user",
        organization_id: "rh-org",
        permission: 1,
        type: "user",
        modules: { rh: 0 },
      },
      "test-secret",
      { expiresIn: "5m" },
    );
    const forbidden = await fetch(`${url}/rh/requests`, {
      headers: { cookie: `cw.session=${noRhToken}` },
    });
    expect(forbidden.status).toBe(403);
  } finally {
    await stopServer(server);
    await stopServer(upstreamServer);
    vi.unstubAllEnvs();
  }
});

it("enforces bound CSRF on cookie-authenticated mutations", async () => {
  const csrfToken = "A".repeat(43);
  const sessionToken = createToken({
    user_id: "user-1",
    organization_id: "org-1",
    permission: 3,
    type: "owner",
    csrf_hash: hashCsrfToken(csrfToken),
  });
  let upstreamHits = 0;
  const upstream = createServer((_request, response) => {
    upstreamHits += 1;
    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    response.setHeader("set-cookie", "untrusted=value; Path=/; HttpOnly");
    response.end(JSON.stringify({ success: true, data: { ok: true } }));
  });
  const taskServiceUrl = await startServer(upstream);
  const app = createApp(
    createEnv({
      taskServiceUrl,
      allowedOrigins: ["https://useoffice.com.br"],
      bearerAuthCompatibility: false,
    }),
    createTestLogger(),
  );
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);

  try {
    const headers = {
      Cookie: `cw.session=${sessionToken}; cw.csrf=${csrfToken}`,
      Origin: "https://useoffice.com.br",
      "content-type": "application/json",
    };
    const accepted = await fetch(`${gatewayUrl}/task/security-proof`, {
      method: "POST",
      headers: { ...headers, [CSRF_HEADER_NAME]: csrfToken },
      body: JSON.stringify({ safe: true }),
    });
    const rejected = await fetch(`${gatewayUrl}/task/security-proof`, {
      method: "POST",
      headers,
      body: JSON.stringify({ safe: false }),
    });

    expect(accepted.status).toBe(200);
    expect(accepted.headers.getSetCookie()).toEqual([]);
    expect(rejected.status).toBe(403);
    expect(upstreamHits).toBe(1);
  } finally {
    await stopServer(gateway);
    await stopServer(upstream);
  }
});

it("permits credentialed CORS only for the configured browser origin", async () => {
  const app = createApp(
    createEnv({ allowedOrigins: ["https://useoffice.com.br"] }),
    createTestLogger(),
  );
  const server = createServer(app);
  const baseUrl = await startServer(server);

  try {
    const preflight = (origin: string) =>
      fetch(`${baseUrl}/task/security-proof`, {
        method: "OPTIONS",
        headers: {
          Origin: origin,
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": CSRF_HEADER_NAME,
        },
      });
    const allowed = await preflight("https://useoffice.com.br");
    const nullOrigin = await preflight("null");
    const hostile = await preflight("https://evil.example");

    expect(allowed.status).toBe(204);
    expect(allowed.headers.get("access-control-allow-origin")).toBe("https://useoffice.com.br");
    expect(allowed.headers.get("access-control-allow-credentials")).toBe("true");
    expect(allowed.headers.get("access-control-allow-headers")).toContain(CSRF_HEADER_NAME);
    expect(nullOrigin.status).toBe(403);
    expect(hostile.status).toBe(403);
    expect(nullOrigin.headers.get("access-control-allow-credentials")).not.toBe("true");
    expect(hostile.headers.get("access-control-allow-credentials")).not.toBe("true");
  } finally {
    await stopServer(server);
  }
});

it("proxies reports requests with the authenticated context and no gateway module policy", async () => {
  const reportsService = createServer((request, response) => {
    expect(request.headers[FORWARDED_AUTH_USER_ID_HEADER]).toBe("reports-user");
    expect(request.headers[FORWARDED_AUTH_ORGANIZATION_ID_HEADER]).toBe("reports-org");
    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ success: true, data: { items: [] } }));
  });
  const reportsServiceUrl = await startServer(reportsService);
  const app = createApp(createEnv({ reportsServiceUrl }), createTestLogger());
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);

  try {
    const response = await fetch(`${gatewayUrl}/reports/catalog`, {
      headers: {
        Authorization: `Bearer ${createToken({
          user_id: "reports-user",
          organization_id: "reports-org",
          permission: 0,
          modules: {},
        })}`,
      },
    });

    expect(response.status).toBe(200);
  } finally {
    await stopServer(gateway);
    await stopServer(reportsService);
  }
});

it("protects report definition review with bound CSRF and forwarded identity", async () => {
  const proof = "A".repeat(43);
  const session = createToken({
    user_id: "reports-user",
    organization_id: "reports-org",
    permission: 0,
    type: "user",
    csrf_hash: hashCsrfToken(proof),
  });
  let hits = 0;
  const upstream = createServer((request, response) => {
    hits += 1;
    expect(request.url).toBe("/reports/definitions/validate");
    expect(request.headers[FORWARDED_AUTH_USER_ID_HEADER]).toBe("reports-user");
    expect(request.headers[FORWARDED_AUTH_ORGANIZATION_ID_HEADER]).toBe("reports-org");
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ success: true, data: {} }));
  });
  const reportsServiceUrl = await startServer(upstream);
  const gateway = createServer(
    createApp(
      createEnv({
        reportsServiceUrl,
        allowedOrigins: ["https://useoffice.com.br"],
        bearerAuthCompatibility: false,
      }),
      createTestLogger(),
    ),
  );
  const url = await startServer(gateway);
  try {
    const headers = {
      Cookie: `cw.session=${session}; cw.csrf=${proof}`,
      Origin: "https://useoffice.com.br",
      "content-type": "application/json",
    };
    const body = JSON.stringify({
      definition: { version: 2, areas: [{ source: "integracao.projects", fields: ["name"] }] },
    });
    const denied = await fetch(`${url}/reports/definitions/validate`, {
      method: "POST",
      headers,
      body,
    });
    expect(denied.status).toBe(403);
    expect(hits).toBe(0);
    const accepted = await fetch(`${url}/reports/definitions/validate`, {
      method: "POST",
      headers: { ...headers, [CSRF_HEADER_NAME]: proof },
      body,
    });
    expect(accepted.status).toBe(200);
    expect(hits).toBe(1);
  } finally {
    await stopServer(gateway);
    await stopServer(upstream);
  }
});

function createToken(
  claims: {
    user_id: string;
    organization_id: string;
    permission: number;
    type?: "owner" | "admin" | "user";
    modules?: Record<string, number | null>;
    csrf_hash?: string;
  },
  secret = "test-secret",
): string {
  return jwt.sign(
    {
      ...claims,
      type: claims.type ?? (claims.permission >= 2 ? "owner" : "user"),
    },
    secret,
  );
}

function createPlatformToken(
  claims: {
    user_id?: string;
    session_id?: string;
    session_version?: number;
    csrf_hash?: string;
  } = {},
  secret = "test-secret",
): string {
  return jwt.sign(
    {
      user_id: "platform-user-1",
      auth_kind: "platform",
      platform_role: "super_admin",
      session_id: "platform-session-1",
      session_version: 1,
      csrf_hash: "a".repeat(64),
      ...claims,
    },
    secret,
  );
}

it("roteia cada contrato de plataforma ao upstream correto com identidade antiforja", async () => {
  const seen: Array<{
    service: string;
    url: string;
    userId?: string;
    organizationId?: string;
    authKind?: string;
    platformRole?: string;
    internalToken?: string;
    cookie?: string;
  }> = [];
  const upstream = (service: string) =>
    createServer((request, response) => {
      seen.push({
        service,
        url: request.url ?? "",
        userId: request.headers[FORWARDED_AUTH_USER_ID_HEADER] as string | undefined,
        organizationId: request.headers[FORWARDED_AUTH_ORGANIZATION_ID_HEADER] as
          | string
          | undefined,
        authKind: request.headers[FORWARDED_AUTH_KIND_HEADER] as string | undefined,
        platformRole: request.headers[FORWARDED_AUTH_PLATFORM_ROLE_HEADER] as string | undefined,
        internalToken: request.headers[INTERNAL_SERVICE_TOKEN_HEADER] as string | undefined,
        cookie: request.headers.cookie,
      });
      response.statusCode = 200;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ success: true, data: { service } }));
    });
  const userService = upstream("user-service");
  const organizationService = upstream("organization-service");
  const auditService = upstream("audit-service");
  const userServiceUrl = await startServer(userService);
  const organizationServiceUrl = await startServer(organizationService);
  const auditServiceUrl = await startServer(auditService);
  const app = createApp(
    createEnv({
      auditEnabled: true,
      userServiceUrl,
      organizationServiceUrl,
      auditServiceUrl,
      bearerAuthCompatibility: true,
    }),
    createTestLogger(),
    { sessionValidator: vi.fn().mockResolvedValue(undefined) },
  );
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);
  const platformToken = createPlatformToken();
  const organizationToken = createToken({
    user_id: "organization-user-1",
    organization_id: "org-1",
    permission: 3,
  });

  try {
    const forgedHeaders = {
      Cookie: `theme=dark; cw.session=${platformToken}; cw.csrf=browser-only-proof`,
      [FORWARDED_AUTH_USER_ID_HEADER]: "attacker",
      [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: "attacker-org",
      [FORWARDED_AUTH_KIND_HEADER]: "organization",
      [FORWARDED_AUTH_PLATFORM_ROLE_HEADER]: "super_admin",
      [INTERNAL_SERVICE_TOKEN_HEADER]: "attacker-token",
    };
    const requests = [];
    for (const path of [
      "/platform/me",
      "/platform/organizations",
      "/platform/organizations/org-1",
      "/platform/organizations/org-1/users",
      "/platform/organizations/org-1/users/user-1",
      "/platform/organizations/org-1/departments",
      "/platform/audit/requests",
    ]) {
      requests.push(await fetch(`${gatewayUrl}${path}`, { headers: forgedHeaders }));
    }

    expect(requests.map((response) => response.status)).toEqual([
      200, 200, 200, 200, 200, 200, 200,
    ]);
    const proxiedRequests = seen.filter(({ url }) => url !== "/internal/audit/requests");
    expect(proxiedRequests.map(({ service, url }) => ({ service, url }))).toEqual([
      { service: "user-service", url: "/platform/me" },
      { service: "organization-service", url: "/platform/organizations" },
      { service: "organization-service", url: "/platform/organizations/org-1" },
      { service: "user-service", url: "/platform/organizations/org-1/users" },
      { service: "user-service", url: "/platform/organizations/org-1/users/user-1" },
      { service: "user-service", url: "/platform/organizations/org-1/departments" },
      { service: "audit-service", url: "/audit/requests" },
    ]);
    for (const forwarded of proxiedRequests) {
      expect(forwarded).toMatchObject({
        userId: "platform-user-1",
        authKind: "platform",
        platformRole: "super_admin",
        internalToken:
          forwarded.service === "user-service"
            ? "user-service-internal-token"
            : "audit-service-token",
      });
      expect(forwarded.organizationId).toBeUndefined();
    }
    expect(proxiedRequests.slice(0, 6).map(({ cookie }) => cookie)).toEqual([
      `cw.session=${platformToken}`,
      `cw.session=${platformToken}`,
      `cw.session=${platformToken}`,
      `cw.session=${platformToken}`,
      `cw.session=${platformToken}`,
      `cw.session=${platformToken}`,
    ]);
    expect(proxiedRequests[6]?.cookie).toBeUndefined();

    const platformOnOrganizationRoute = await fetch(`${gatewayUrl}/organizations`, {
      headers: { Cookie: `cw.session=${platformToken}` },
    });
    const organizationOnPlatformRoute = await fetch(`${gatewayUrl}/platform/organizations`, {
      headers: { Cookie: `cw.session=${organizationToken}` },
    });
    const browserBearer = await fetch(`${gatewayUrl}/platform/me`, {
      headers: { Authorization: `Bearer ${platformToken}` },
    });
    const internalValidation = await fetch(`${gatewayUrl}/platform/session/validate`, {
      method: "POST",
      headers: { Cookie: `cw.session=${platformToken}` },
    });

    expect(platformOnOrganizationRoute.status).toBe(403);
    expect(organizationOnPlatformRoute.status).toBe(403);
    expect(browserBearer.status).toBe(401);
    expect(internalValidation.status).toBe(404);
    expect(proxiedRequests).toHaveLength(7);
  } finally {
    await stopServer(gateway);
    await stopServer(userService);
    await stopServer(organizationService);
    await stopServer(auditService);
  }
});

it("exige CSRF e limita credenciais encaminhadas em refresh e logout da plataforma", async () => {
  const csrfToken = "P".repeat(43);
  const platformToken = createPlatformToken({ csrf_hash: hashCsrfToken(csrfToken) });
  const upstreamRequests: Array<{ url: string; cookie?: string; csrf?: string }> = [];
  const userService = createServer((request, response) => {
    upstreamRequests.push({
      url: request.url ?? "",
      cookie: request.headers.cookie,
      csrf: request.headers[CSRF_HEADER_NAME] as string | undefined,
    });
    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    response.setHeader("set-cookie", [
      "cw.session=rotated; Path=/; HttpOnly; SameSite=Lax",
      "cw.csrf=rotated-csrf; Path=/; SameSite=Lax",
    ]);
    response.end(JSON.stringify({ success: true, data: { ok: true } }));
  });
  const userServiceUrl = await startServer(userService);
  const app = createApp(
    createEnv({
      userServiceUrl,
      bearerAuthCompatibility: false,
      allowedOrigins: ["https://useoffice.com.br"],
    }),
    createTestLogger(),
    { sessionValidator: vi.fn().mockResolvedValue(undefined) },
  );
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);
  const headers = {
    Cookie: `theme=dark; cw.session=${platformToken}; cw.csrf=${csrfToken}`,
    Origin: "https://useoffice.com.br",
    [CSRF_HEADER_NAME]: csrfToken,
  };

  try {
    const missingRefreshCsrf = await fetch(`${gatewayUrl}/platform/session/refresh`, {
      method: "POST",
      headers: { Cookie: headers.Cookie, Origin: headers.Origin },
    });
    const missingLogoutCsrf = await fetch(`${gatewayUrl}/platform/session`, {
      method: "DELETE",
      headers: { Cookie: headers.Cookie, Origin: headers.Origin },
    });
    const refresh = await fetch(`${gatewayUrl}/platform/session/refresh`, {
      method: "POST",
      headers,
    });
    const trailingSlashRefresh = await fetch(`${gatewayUrl}/platform/session/refresh/`, {
      method: "POST",
      headers,
    });
    const wrongMethod = await fetch(`${gatewayUrl}/platform/session/refresh`, {
      method: "GET",
      headers,
    });
    const logout = await fetch(`${gatewayUrl}/platform/session`, { method: "DELETE", headers });

    expect(missingRefreshCsrf.status).toBe(403);
    expect(missingLogoutCsrf.status).toBe(403);
    expect(refresh.status).toBe(200);
    expect(trailingSlashRefresh.status).toBe(200);
    expect(wrongMethod.status).toBe(403);
    expect(logout.status).toBe(200);
    expect(refresh.headers.getSetCookie()).toHaveLength(2);
    expect(trailingSlashRefresh.headers.getSetCookie()).toHaveLength(2);
    expect(wrongMethod.headers.getSetCookie()).toHaveLength(0);
    expect(logout.headers.getSetCookie()).toHaveLength(2);
    expect(upstreamRequests).toEqual([
      {
        url: "/platform/session/refresh",
        cookie: `cw.session=${platformToken}; cw.csrf=${csrfToken}`,
        csrf: csrfToken,
      },
      {
        url: "/platform/session/refresh",
        cookie: `cw.session=${platformToken}; cw.csrf=${csrfToken}`,
        csrf: csrfToken,
      },
      {
        url: "/platform/session",
        cookie: `cw.session=${platformToken}; cw.csrf=${csrfToken}`,
        csrf: csrfToken,
      },
    ]);
  } finally {
    await stopServer(gateway);
    await stopServer(userService);
  }
});

it("aplica rate limit ao login público da plataforma", async () => {
  let upstreamHits = 0;
  let upstreamInternalToken: string | undefined;
  const userService = createServer((request, response) => {
    upstreamHits += 1;
    upstreamInternalToken = request.headers[INTERNAL_SERVICE_TOKEN_HEADER] as string | undefined;
    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ success: true, data: { id: "platform-user-1" } }));
  });
  const userServiceUrl = await startServer(userService);
  const app = createApp(createEnv({ userServiceUrl, authRateLimitMax: 1 }), createTestLogger());
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);

  try {
    const login = () =>
      fetch(`${gatewayUrl}/platform/session`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "admin@example.com", password: "secret" }),
      });
    const accepted = await login();
    const limited = await login();

    expect(accepted.status).toBe(200);
    expect(limited.status).toBe(429);
    expect(upstreamHits).toBe(1);
    expect(upstreamInternalToken).toBe("user-service-internal-token");
  } finally {
    await stopServer(gateway);
    await stopServer(userService);
  }
});

it("bloqueia self-PUT de ator de plataforma antes do proxy", async () => {
  const csrfToken = "P".repeat(43);
  let upstreamHits = 0;
  const userService = createServer((_request, response) => {
    upstreamHits += 1;
    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ success: true, data: { ok: true } }));
  });
  const userServiceUrl = await startServer(userService);
  const app = createApp(
    createEnv({
      userServiceUrl,
      allowedOrigins: ["https://useoffice.com.br"],
      bearerAuthCompatibility: false,
    }),
    createTestLogger(),
  );
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);

  try {
    const response = await fetch(`${gatewayUrl}/user/platform-user-1`, {
      method: "PUT",
      headers: {
        Cookie: `cw.session=${createPlatformToken({ csrf_hash: hashCsrfToken(csrfToken) })}; cw.csrf=${csrfToken}`,
        Origin: "https://useoffice.com.br",
        [CSRF_HEADER_NAME]: csrfToken,
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: "forbidden" }),
    });

    expect(response.status).toBe(403);
    expect(upstreamHits).toBe(0);
  } finally {
    await stopServer(gateway);
    await stopServer(userService);
  }
});

it("audita somente queries allowlisted nas leituras de organização da plataforma", async () => {
  const upstreamUrls: string[] = [];
  const auditService = await startAuditIngestServer();
  const platformServices = createServer((request, response) => {
    upstreamUrls.push(request.url ?? "");
    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ success: true, data: { organizations: [] } }));
  });
  const platformServicesUrl = await startServer(platformServices);
  const app = createApp(
    createEnv({
      auditEnabled: true,
      auditServiceUrl: auditService.url,
      organizationServiceUrl: platformServicesUrl,
      userServiceUrl: platformServicesUrl,
      bearerAuthCompatibility: false,
    }),
    createTestLogger(),
    { sessionValidator: vi.fn().mockResolvedValue(undefined) },
  );
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);

  try {
    const headers = { Cookie: `cw.session=${createPlatformToken()}` };
    const urls = [
      "/platform/organizations?page=1&page=page-secret&pageSize=5&status=active&search=SecretCorp&search=11222333000181&cnpj=query-cnpj&email=query-email&token=query-token-1&token=query-token-2&cookie=query-cookie",
      "/platform/organizations/9a68a809-9a78-4ef9-94d0-b9bb9787ad2e?token=detail-token&email=detail-email",
      "/platform/organizations/9a68a809-9a78-4ef9-94d0-b9bb9787ad2e/users?skip=0&skip=skip-secret&take=5&search=user-secret&token=users-token-1&token=users-token-2",
      "/platform/organizations?page=10001&pageSize=1&status=cancelled",
      "/platform/organizations?page=10002&pageSize=101",
      "/platform/organizations?page=11222333000181",
      "/platform/organizations?page=102&pageSize=100&status=active",
      "/platform/organizations/9a68a809-9a78-4ef9-94d0-b9bb9787ad2e/users?skip=10000&take=100",
      "/platform/organizations/9a68a809-9a78-4ef9-94d0-b9bb9787ad2e/users?skip=10001&take=101",
      "/platform/organizations/9a68a809-9a78-4ef9-94d0-b9bb9787ad2e/users?skip=11222333000181",
      "/platform/organizations?page=501",
      "/platform/organizations?page=502",
      "/platform/organizations?page=1",
      "/platform/organizations/9a68a809-9a78-4ef9-94d0-b9bb9787ad2e/users?skip=0&take=1",
      "/platform/organizations?page=invalid-page",
      "/platform/organizations?pageSize=invalid-page-size",
      "/platform/organizations?status=invalid-status",
      "/platform/organizations/9a68a809-9a78-4ef9-94d0-b9bb9787ad2e/users?skip=invalid-skip",
      "/platform/organizations/9a68a809-9a78-4ef9-94d0-b9bb9787ad2e/users?take=invalid-take",
    ];
    const responses = [];
    for (const url of urls) {
      responses.push(await fetch(`${gatewayUrl}${url}`, { headers }));
    }

    expect(responses.map(({ status }) => status)).toEqual(Array(urls.length).fill(200));
    expect(upstreamUrls).toEqual(urls);
    await waitForRecords(auditService.records, urls.length);
    expect(auditService.records[0]).toMatchObject({
      organizationId: null,
      userId: null,
      query: { pageSize: "5", status: "active" },
      metadata: {
        auth_kind: "platform",
        platform_user_id: "platform-user-1",
        routeTarget: "organization-service",
      },
    });
    expect(auditService.records[1]?.query).toEqual({});
    expect(auditService.records[2]).toMatchObject({
      query: { take: "5" },
      metadata: { routeTarget: "user-service" },
    });
    expect(auditService.records.slice(3).map(({ query }) => query)).toEqual([
      { page: "10001", pageSize: "1", status: "cancelled" },
      {},
      {},
      { status: "active" },
      { skip: "10000", take: "100" },
      {},
      {},
      { page: "501" },
      {},
      { page: "1" },
      { skip: "0", take: "1" },
      {},
      {},
      {},
      {},
      {},
    ]);
    const serializedAudit = JSON.stringify(auditService.records);
    for (const sensitive of [
      "SecretCorp",
      "page-secret",
      "11222333000181",
      "query-cnpj",
      "query-email",
      "query-token-1",
      "query-token-2",
      "query-cookie",
      "detail-token",
      "detail-email",
      "user-secret",
      "skip-secret",
      "users-token-1",
      "users-token-2",
      "invalid-page",
      "invalid-page-size",
      "invalid-status",
      "invalid-skip",
      "invalid-take",
    ]) {
      expect(serializedAudit).not.toContain(sensitive);
    }
  } finally {
    await stopServer(gateway);
    await stopServer(platformServices);
    await stopServer(auditService.server);
  }
});

it("persiste uma tentativa e audita o resultado de cada mutação de organização da plataforma", async () => {
  const csrfToken = "P".repeat(43);
  const platformToken = createPlatformToken({ csrf_hash: hashCsrfToken(csrfToken) });
  const upstreamRequests: Array<{
    method?: string;
    url?: string;
    cookie?: string;
    csrf?: string;
    authorization?: string;
    body: unknown;
  }> = [];
  const auditService = await startAuditIngestServer();
  const organizationService = createServer(async (request, response) => {
    upstreamRequests.push({
      method: request.method,
      url: request.url,
      cookie: request.headers.cookie,
      csrf: request.headers[CSRF_HEADER_NAME] as string | undefined,
      authorization: request.headers.authorization,
      body: await readJsonBody(request),
    });
    response.statusCode = request.method === "POST" ? 201 : 200;
    response.setHeader("content-type", "application/json");
    response.end(
      JSON.stringify({
        success: true,
        data: {
          id: "9a68a809-9a78-4ef9-94d0-b9bb9787ad2e",
          updated_at: "2026-08-25T12:00:00.000Z",
        },
      }),
    );
  });
  const organizationServiceUrl = await startServer(organizationService);
  const app = createApp(
    createEnv({
      auditEnabled: true,
      auditServiceUrl: auditService.url,
      organizationServiceUrl,
      allowedOrigins: ["https://useoffice.com.br"],
      bearerAuthCompatibility: true,
    }),
    createTestLogger(),
    { sessionValidator: vi.fn().mockResolvedValue(undefined) },
  );
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);
  const headers = {
    Authorization: "Bearer browser-secret",
    Cookie: `theme=dark; cw.session=${platformToken}; cw.csrf=${csrfToken}`,
    Origin: "https://useoffice.com.br",
    [CSRF_HEADER_NAME]: csrfToken,
    "content-type": "application/json",
  };
  const operations = [
    {
      method: "POST",
      path: "/platform/organizations",
      body: { name: "Smoke secret name", cnpj: "11222333000181" },
      query: "?token=mutation-token&cnpj=mutation-cnpj&email=mutation-email",
      status: 201,
    },
    {
      method: "PATCH",
      path: "/platform/organizations/9a68a809-9a78-4ef9-94d0-b9bb9787ad2e/subscription-plan",
      body: { subscription_plan: "pro", expected_updated_at: "2026-08-25T12:00:00.000Z" },
      query: "?token=mutation-token&cnpj=mutation-cnpj&email=mutation-email",
      status: 200,
    },
    {
      method: "PATCH",
      path: "/platform/organizations/9a68a809-9a78-4ef9-94d0-b9bb9787ad2e/logo-url",
      body: {
        logo_url: "https://cdn.example.com/private-logo.png",
        expected_updated_at: "2026-08-25T12:00:00.000Z",
      },
      query: "?token=mutation-token&cnpj=mutation-cnpj&email=mutation-email",
      status: 200,
    },
    {
      method: "PATCH",
      path: "/platform/organizations/9a68a809-9a78-4ef9-94d0-b9bb9787ad2e/status",
      body: { status: "cancelled", expected_updated_at: "2026-08-25T12:00:00.000Z" },
      query: "?token=mutation-token&cnpj=mutation-cnpj&email=mutation-email",
      status: 200,
    },
  ];

  try {
    for (const operation of operations) {
      const response = await fetch(`${gatewayUrl}${operation.path}${operation.query}`, {
        method: operation.method,
        headers,
        body: JSON.stringify(operation.body),
      });
      expect(response.status, `${operation.method} ${operation.path}`).toBe(operation.status);
    }

    await waitForRecords(auditService.records, operations.length * 2);
    expect(upstreamRequests).toHaveLength(operations.length);
    for (const request of upstreamRequests) {
      expect(request.url).toContain("mutation-token");
      expect(request.cookie).toBe(`cw.session=${platformToken}; cw.csrf=${csrfToken}`);
      expect(request.csrf).toBe(csrfToken);
      expect(request.authorization).toBeUndefined();
    }

    expect(
      auditService.records
        .filter((record) => record.action !== "organization.mutation.attempt")
        .map(({ method, path, metadata }) => ({ method, path, metadata })),
    ).toEqual(
      operations.map(({ method, path }) => ({
        method,
        path,
        metadata: expect.objectContaining({
          routeTarget: "organization-service",
          auth_kind: "platform",
          platform_user_id: "platform-user-1",
        }),
      })),
    );
    expect(
      auditService.records.filter((record) => record.action === "organization.mutation.attempt"),
    ).toHaveLength(operations.length);
    expect(new Set(auditService.records.map((record) => record.requestId)).size).toBe(
      operations.length * 2,
    );
    const serializedAudit = JSON.stringify(auditService.records);
    expect(serializedAudit).not.toContain("11222333000181");
    expect(serializedAudit).not.toContain("Smoke secret name");
    expect(serializedAudit).not.toContain("private-logo.png");
    expect(serializedAudit).not.toContain(platformToken);
    expect(serializedAudit).not.toContain(csrfToken);
    expect(serializedAudit).not.toContain("mutation-token");
    expect(serializedAudit).not.toContain("mutation-cnpj");
    expect(serializedAudit).not.toContain("mutation-email");
  } finally {
    await stopServer(gateway);
    await stopServer(organizationService);
    await stopServer(auditService.server);
  }
});

it("não chama o organization-service quando a auditoria obrigatória está desabilitada", async () => {
  const csrfToken = "P".repeat(43);
  let upstreamHits = 0;
  const organizationService = createServer((_request, response) => {
    upstreamHits += 1;
    response.statusCode = 201;
    response.end();
  });
  const organizationServiceUrl = await startServer(organizationService);
  const app = createApp(
    createEnv({
      auditEnabled: false,
      organizationServiceUrl,
      allowedOrigins: ["https://useoffice.com.br"],
    }),
    createTestLogger(),
    { sessionValidator: vi.fn().mockResolvedValue(undefined) },
  );
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);

  try {
    const response = await fetch(`${gatewayUrl}/platform/organizations`, {
      method: "POST",
      headers: {
        Cookie: `cw.session=${createPlatformToken({ csrf_hash: hashCsrfToken(csrfToken) })}; cw.csrf=${csrfToken}`,
        Origin: "https://useoffice.com.br",
        [CSRF_HEADER_NAME]: csrfToken,
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: "Blocked", cnpj: "11222333000181" }),
    });

    expect(response.status).toBe(503);
    expect(upstreamHits).toBe(0);
  } finally {
    await stopServer(gateway);
    await stopServer(organizationService);
  }
});

it.each([
  "network",
  "http",
  "timeout",
])("barreira HTTP não despacha organização quando ACK de auditoria falha: %s", async (failure) => {
  const realFetch = globalThis.fetch;
  const csrfToken = "P".repeat(43);
  let upstreamHits = 0;
  const organizationService = createServer((_request, response) => {
    upstreamHits += 1;
    response.writeHead(201).end();
  });
  const organizationServiceUrl = await startServer(organizationService);
  const auditServiceUrl = "http://audit-service.test";
  const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    if (!String(input).startsWith(auditServiceUrl)) return realFetch(input, init);
    const payload = JSON.parse(String(init?.body)) as CreateAuditRequestPayload;
    if (payload.action !== "organization.mutation.attempt")
      return new Response(null, { status: 201 });
    if (failure === "http") return new Response("private-audit-error", { status: 500 });
    if (failure === "timeout") {
      await new Promise((_, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
      });
    }
    throw new Error("private-audit-error");
  });
  const gateway = createServer(
    createApp(
      createEnv({ auditEnabled: true, auditServiceUrl, organizationServiceUrl }),
      createTestLogger(),
      { sessionValidator: vi.fn().mockResolvedValue(undefined) },
    ),
  );
  const gatewayUrl = await startServer(gateway);
  try {
    const response = await realFetch(`${gatewayUrl}/platform/organizations`, {
      method: "POST",
      headers: {
        Cookie: `cw.session=${createPlatformToken({ csrf_hash: hashCsrfToken(csrfToken) })}; cw.csrf=${csrfToken}`,
        [CSRF_HEADER_NAME]: csrfToken,
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: "Blocked", cnpj: "11222333000181" }),
    });
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private-audit-error");
    expect(upstreamHits).toBe(0);
  } finally {
    fetchSpy.mockRestore();
    await stopServer(gateway);
    await stopServer(organizationService);
  }
}, 15_000);

it("nega auth/CSRF antes do ACK e só despacha a organização após confirmação", async () => {
  const realFetch = globalThis.fetch;
  const csrfToken = "P".repeat(43);
  let upstreamHits = 0;
  const organizationService = createServer((_request, response) => {
    upstreamHits += 1;
    response.writeHead(201).end();
  });
  const organizationServiceUrl = await startServer(organizationService);
  const auditServiceUrl = "http://audit-service.test";
  const attempts: CreateAuditRequestPayload[] = [];
  let release!: () => void;
  const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    if (!String(input).startsWith(auditServiceUrl)) return realFetch(input, init);
    const payload = JSON.parse(String(init?.body)) as CreateAuditRequestPayload;
    if (payload.action === "organization.mutation.attempt") {
      attempts.push(payload);
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    }
    return new Response(null, { status: 201 });
  });
  const gateway = createServer(
    createApp(
      createEnv({ auditEnabled: true, auditServiceUrl, organizationServiceUrl }),
      createTestLogger(),
      { sessionValidator: vi.fn().mockResolvedValue(undefined) },
    ),
  );
  const gatewayUrl = await startServer(gateway);
  const headers = {
    Cookie: `cw.session=${createPlatformToken({ csrf_hash: hashCsrfToken(csrfToken) })}; cw.csrf=${csrfToken}`,
    [CSRF_HEADER_NAME]: csrfToken,
    "content-type": "application/json",
  };
  const url = `${gatewayUrl}/platform/organizations`;
  const body = JSON.stringify({ name: "Allowed", cnpj: "11222333000181" });
  try {
    expect(
      (
        await realFetch(url, {
          method: "POST",
          body,
          headers: { "content-type": "application/json" },
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await realFetch(url, {
          method: "POST",
          body,
          headers: { ...headers, [CSRF_HEADER_NAME]: "wrong" },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await realFetch(url, {
          method: "POST",
          body,
          headers: {
            ...headers,
            Cookie: `cw.session=${createToken({ user_id: "org-user", organization_id: "org-1", permission: 3, type: "owner", csrf_hash: hashCsrfToken(csrfToken) })}; cw.csrf=${csrfToken}`,
          },
        })
      ).status,
    ).toBe(403);
    expect(attempts).toHaveLength(0);
    expect(upstreamHits).toBe(0);
    const operation = realFetch(url, { method: "POST", body, headers });
    await vi.waitFor(() => expect(attempts).toHaveLength(1));
    expect(upstreamHits).toBe(0);
    release();
    expect((await operation).status).toBe(201);
    expect(upstreamHits).toBe(1);
  } finally {
    release?.();
    fetchSpy.mockRestore();
    await stopServer(gateway);
    await stopServer(organizationService);
  }
});

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
    expect(body.error).toBe("Não autenticado.");
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

it("blocks PUT /user/:id without user-management permission", async () => {
  let upstreamHits = 0;
  const upstream = createServer((_request, response) => {
    upstreamHits += 1;
    response.statusCode = 200;
    response.end(JSON.stringify({ success: true }));
  });
  const userServiceUrl = await startServer(upstream);
  const app = createApp(createEnv({ userServiceUrl }), createTestLogger());
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);

  try {
    const response = await fetch(`${gatewayUrl}/user/user-3`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${createToken({
          user_id: "user-1",
          organization_id: "org-1",
          permission: 1,
          type: "user",
        })}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ modules: { rh: 1 } }),
    });

    expect(response.status).toBe(403);
    expect(upstreamHits).toBe(0);
  } finally {
    await stopServer(gateway);
    await stopServer(upstream);
  }
});

it("proxies PUT /user/:id for an authorized owner", async () => {
  let seenMethod = "";
  let seenUrl = "";
  const upstream = createServer((request, response) => {
    seenMethod = request.method ?? "";
    seenUrl = request.url ?? "";
    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ success: true, data: {} }));
  });
  const userServiceUrl = await startServer(upstream);
  const app = createApp(createEnv({ userServiceUrl }), createTestLogger());
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);

  try {
    const response = await fetch(`${gatewayUrl}/user/user-3`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${createToken({
          user_id: "owner-1",
          organization_id: "org-1",
          permission: 2,
          type: "owner",
        })}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ modules: { rh: 1 } }),
    });

    expect(response.status).toBe(200);
    expect(seenMethod).toBe("PUT");
    expect(seenUrl).toBe("/user/user-3");
  } finally {
    await stopServer(gateway);
    await stopServer(upstream);
  }
});

it("proxies authenticated self password updates with PUT to user-service", async () => {
  let seenHeaders: {
    userId?: string;
    organizationId?: string;
    permission?: string;
    type?: string;
  } = {};
  let seenMethod = "";

  const upstream = createServer((request, response) => {
    seenMethod = request.method ?? "";
    seenHeaders = {
      userId: request.headers[FORWARDED_AUTH_USER_ID_HEADER] as string | undefined,
      organizationId: request.headers[FORWARDED_AUTH_ORGANIZATION_ID_HEADER] as string | undefined,
      permission: request.headers[FORWARDED_AUTH_PERMISSION_HEADER] as string | undefined,
      type: request.headers[FORWARDED_AUTH_TYPE_HEADER] as string | undefined,
    };
    request.resume();
    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ success: true, data: { updated: true } }));
  });
  const userServiceUrl = await startServer(upstream);
  const app = createApp(createEnv({ userServiceUrl }), createTestLogger());
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);
  const token = createToken({
    user_id: "user-1",
    organization_id: "org-1",
    permission: 0,
    type: "user",
  });

  try {
    const response = await fetch(`${gatewayUrl}/user/user-1`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ password: "nova-senha-segura" }),
    });

    expect(response.status).toBe(200);
    expect(seenMethod).toBe("PUT");
    expect(seenHeaders).toEqual({
      userId: "user-1",
      organizationId: "org-1",
      permission: "0",
      type: "user",
    });
  } finally {
    await stopServer(gateway);
    await stopServer(upstream);
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
    modules: { rh: 3 },
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
    expect(JSON.parse(seenHeaders.modules ?? "{}")).toMatchObject({ rh: 3 });
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
    modules: { rh: 3 },
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

    expect(response.status).toBe(403);
    expect(seenRequest).toBe(false);
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

it("replaces client-supplied internal auth headers before proxying", async () => {
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
    authorization?: string;
    cookie?: string;
    csrf?: string;
  } = {};

  const upstream = createServer((request, response) => {
    seenHeaders = {
      internalToken: request.headers[INTERNAL_SERVICE_TOKEN_HEADER] as string | undefined,
      userId: request.headers[FORWARDED_AUTH_USER_ID_HEADER] as string | undefined,
      organizationId: request.headers[FORWARDED_AUTH_ORGANIZATION_ID_HEADER] as string | undefined,
      permission: request.headers[FORWARDED_AUTH_PERMISSION_HEADER] as string | undefined,
      type: request.headers[FORWARDED_AUTH_TYPE_HEADER] as string | undefined,
      modules: request.headers[FORWARDED_AUTH_MODULES_HEADER] as string | undefined,
      authorization: request.headers.authorization,
      cookie: request.headers.cookie,
      csrf: request.headers["x-csrf-token"] as string | undefined,
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
        Authorization: "Bearer browser-secret",
        Cookie: `theme=dark; cw.session=${token}; cw.csrf=proof`,
        [INTERNAL_SERVICE_TOKEN_HEADER]: "client-supplied-token",
        [FORWARDED_AUTH_USER_ID_HEADER]: "attacker-user",
        [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: "attacker-org",
        [FORWARDED_AUTH_PERMISSION_HEADER]: "999",
        [FORWARDED_AUTH_TYPE_HEADER]: "attacker-type",
        [FORWARDED_AUTH_MODULES_HEADER]: JSON.stringify({ rh: 0 }),
        "x-csrf-token": "browser-proof",
      },
    });

    expect(response.status).toBe(200);
    expect(seenHeaders.internalToken).toBe("audit-service-token");
    expect(seenHeaders.userId).toBe("user-1");
    expect(seenHeaders.organizationId).toBe("org-1");
    expect(seenHeaders.permission).toBe("2");
    expect(seenHeaders.type).toBe("owner");
    expect(JSON.parse(seenHeaders.modules ?? "{}")).toMatchObject({ rh: 2 });
    expect(seenHeaders.authorization).toBeUndefined();
    expect(seenHeaders.cookie).toBe("theme=dark");
    expect(seenHeaders.csrf).toBeUndefined();
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

it("preserves both session Set-Cookie headers from the user-service", async () => {
  const upstream = createServer((_request, response) => {
    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    response.setHeader("set-cookie", [
      "cw.session=session-value; Path=/; HttpOnly; SameSite=Lax",
      "cw.csrf=csrf-value; Path=/; SameSite=Lax",
    ]);
    response.end(JSON.stringify({ success: true, data: { id: "user-1" } }));
  });
  const userServiceUrl = await startServer(upstream);
  const app = createApp(createEnv({ userServiceUrl }), createTestLogger());
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);

  try {
    const response = await fetch(`${gatewayUrl}/user/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ login: "user", password: "secret" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie()).toHaveLength(2);
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

it("forwards project-wizard extraction content larger than 1 MiB to task-service", async () => {
  const content = "a".repeat(1024 * 1024 + 1);
  let receivedContentBytes = 0;
  const taskService = createServer(async (request, response) => {
    const body = await readJsonBody<{ content: string }>(request);
    receivedContentBytes = Buffer.byteLength(body.content, "utf8");
    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ success: true, data: { received: true } }));
  });
  const taskServiceUrl = await startServer(taskService);
  const gateway = createServer(createApp(createEnv({ taskServiceUrl }), createTestLogger()));
  const gatewayUrl = await startServer(gateway);
  const token = createToken({
    user_id: "user-1",
    organization_id: "org-1",
    permission: 2,
    modules: { integracao: 1 },
  });

  try {
    const response = await fetch(`${gatewayUrl}/task/project-wizard/extract-tasks`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ content }),
    });

    expect(response.status).toBe(200);
    expect(receivedContentBytes).toBe(Buffer.byteLength(content, "utf8"));
  } finally {
    await stopServer(gateway);
    await stopServer(taskService);
  }
});

it("uses the extraction composition timeout only for its public gateway path", async () => {
  const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
  const taskService = createServer((_request, response) => {
    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ success: true, data: {} }));
  });
  const taskServiceUrl = await startServer(taskService);
  const gateway = createServer(createApp(createEnv({ taskServiceUrl }), createTestLogger()));
  const gatewayUrl = await startServer(gateway);
  const token = createToken({
    user_id: "user-1",
    organization_id: "org-1",
    permission: 2,
    modules: { integracao: 1 },
  });

  try {
    const headers = {
      Authorization: `Bearer ${token}`,
      "content-type": "application/json",
    };
    const extraction = await fetch(`${gatewayUrl}/task/project-wizard/extract-tasks`, {
      method: "POST",
      headers,
      body: JSON.stringify({ content: "Ata" }),
    });
    const regularTaskRoute = await fetch(`${gatewayUrl}/task/list`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(extraction.status).toBe(200);
    expect(regularTaskRoute.status).toBe(200);
    expect(timeoutSpy).toHaveBeenCalledWith(3_600_000);
    expect(timeoutSpy).toHaveBeenCalledWith(30_000);
  } finally {
    timeoutSpy.mockRestore();
    await stopServer(gateway);
    await stopServer(taskService);
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

it("trusts exactly the production edge hop and no proxy in direct local execution", () => {
  expect(createApp(createEnv(), createTestLogger()).get("trust proxy")).toBe(false);
  expect(
    createApp(createEnv({ nodeEnv: "production" }), createTestLogger()).get("trust proxy"),
  ).toBe(1);
});

it("does not let a direct client spoof X-Forwarded-For to evade the login rate limit", async () => {
  let upstreamHits = 0;
  const upstream = createServer((_request, response) => {
    upstreamHits += 1;
    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ success: true, data: { ok: true } }));
  });
  const userServiceUrl = await startServer(upstream);
  const app = createApp(
    createEnv({ userServiceUrl, authRateLimitMax: 1, authRateLimitWindowMs: 60_000 }),
    createTestLogger(),
  );
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);

  try {
    const login = (forwardedFor: string) =>
      fetch(`${gatewayUrl}/user/session`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": forwardedFor,
        },
        body: JSON.stringify({ login: "user", password: "secret" }),
      });

    expect((await login("198.51.100.10")).status).toBe(200);
    expect((await login("203.0.113.20")).status).toBe(429);
    expect(upstreamHits).toBe(1);
  } finally {
    await stopServer(gateway);
    await stopServer(upstream);
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
    expect(body.paths["/contabil/controls/list"]).toBeTruthy();
    expect(body.paths["/ti/requests/list"]).toBeTruthy();
    expect(body.paths["/certificate/pj/list"]).toBeTruthy();
    expect(body.paths["/certificate/pj/{id}/file"]).toBeTruthy();
    expect(body.paths["/certificate/pf/{id}/file"]).toBeTruthy();
    expect(body.paths["/certificate/notifications"]).toBeTruthy();
    expect(body.paths["/audit/requests"]).toBeTruthy();
    expect(body.paths["/parcelamento/installments"]).toBeTruthy();
    expect(body.paths["/parcelamento/panoramas"]).toBeTruthy();
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
    expect(body.components?.securitySchemes?.cookieAuth).toBeTruthy();
    expect(body.components?.securitySchemes?.forwardedAuthUserId).toBe(undefined);
    expect(body.components?.securitySchemes?.internalServiceToken).toBe(undefined);
    expect(body.components?.securitySchemes?.gatewayInternalToken).toBe(undefined);
    const browserAuth = [{ cookieAuth: [] }, { bearerAuth: [] }];
    expect(body.paths["/user/me"]?.get?.security).toEqual(browserAuth);
    expect(body.paths["/user/{id}"]?.get?.security).toEqual(browserAuth);
    expect(body.paths["/audit/requests"]?.get?.security).toEqual(browserAuth);
    expect(body.paths["/ti/requests/list"]?.get?.security).toEqual(browserAuth);
    expect(body.paths["/certificate/pj/list"]?.get?.security).toEqual(browserAuth);
    expect(body.paths["/certificate/pj/{id}/file"]?.get?.security).toEqual(browserAuth);
    expect(
      (
        body.paths["/platform/session"] as unknown as {
          post?: { security?: Array<Record<string, string[]>> };
        }
      )?.post?.security,
    ).toBe(undefined);
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

it("returns 404 for gateway docs in production when documentation is disabled", async () => {
  const app = createApp(
    createEnv({ nodeEnv: "production", enableApiDocs: false }),
    createTestLogger(),
  );
  const server = createServer(app);
  const baseUrl = await startServer(server);

  try {
    for (const route of ["/openapi.json", "/docs", "/docs/swagger-ui-init.js"]) {
      const response = await fetch(`${baseUrl}${route}`);
      expect(response.status, route).toBe(404);
    }
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

it("proxies the three project-wizard routes with trusted authenticated context", async () => {
  const seen: Array<{
    path: string;
    body: Record<string, unknown>;
    internalToken: string | undefined;
    userId: string | undefined;
    organizationId: string | undefined;
    modules: string | undefined;
    authorization: string | undefined;
  }> = [];
  const taskService = createServer(async (request, response) => {
    seen.push({
      path: request.url ?? "",
      body: await readJsonBody<Record<string, unknown>>(request),
      internalToken: request.headers[INTERNAL_SERVICE_TOKEN_HEADER] as string | undefined,
      userId: request.headers[FORWARDED_AUTH_USER_ID_HEADER] as string | undefined,
      organizationId: request.headers[FORWARDED_AUTH_ORGANIZATION_ID_HEADER] as string | undefined,
      modules: request.headers[FORWARDED_AUTH_MODULES_HEADER] as string | undefined,
      authorization: request.headers.authorization,
    });
    response.statusCode = request.url === "/task/project-wizard" ? 201 : 200;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ success: true, data: {} }));
  });
  const taskServiceUrl = await startServer(taskService);
  const gateway = createServer(createApp(createEnv({ taskServiceUrl }), createTestLogger()));
  const gatewayUrl = await startServer(gateway);
  const token = createToken({
    user_id: "wizard-user",
    organization_id: "wizard-org",
    permission: 0,
    type: "user",
    modules: { integracao: 2 },
  });
  const cases = [
    { path: "/task/project-wizard/preview", body: { tasks: [] }, status: 200 },
    {
      path: "/task/project-wizard",
      body: { client_id: "client-private" },
      status: 201,
    },
    {
      path: "/task/project-wizard/extract-tasks",
      body: { content: "Ata privada" },
      status: 200,
    },
  ];

  try {
    for (const testCase of cases) {
      const response = await fetch(`${gatewayUrl}${testCase.path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "content-type": "application/json",
          ...(testCase.path === "/task/project-wizard"
            ? { "Idempotency-Key": "wizard-contract" }
            : {}),
        },
        body: JSON.stringify(testCase.body),
      });

      expect(response.status, testCase.path).toBe(testCase.status);
    }

    expect(seen.map(({ path, body }) => ({ path, body }))).toEqual(
      cases.map(({ path, body }) => ({ path, body })),
    );
    for (const received of seen) {
      expect(received).toMatchObject({
        internalToken: "audit-service-token",
        userId: "wizard-user",
        organizationId: "wizard-org",
        authorization: undefined,
      });
      expect(JSON.parse(received.modules ?? "{}")).toMatchObject({ integracao: 2 });
    }
  } finally {
    await stopServer(gateway);
    await stopServer(taskService);
  }
});

it("protects the three public project-wizard routes before proxying", async () => {
  let upstreamHits = 0;
  const taskService = createServer((_request, response) => {
    upstreamHits += 1;
    response.statusCode = 200;
    response.end();
  });
  const taskServiceUrl = await startServer(taskService);
  const gateway = createServer(createApp(createEnv({ taskServiceUrl }), createTestLogger()));
  const gatewayUrl = await startServer(gateway);
  const viewerToken = createToken({
    user_id: "wizard-viewer",
    organization_id: "wizard-org",
    permission: 0,
    type: "user",
    modules: { integracao: 1 },
  });
  const paths = [
    "/task/project-wizard/preview",
    "/task/project-wizard",
    "/task/project-wizard/extract-tasks",
  ];

  try {
    for (const path of paths) {
      const unauthorized = await fetch(`${gatewayUrl}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      expect(unauthorized.status, path).toBe(401);
      expect(await unauthorized.json(), path).toMatchObject({
        success: false,
        error: "Não autenticado.",
        code: "UNAUTHORIZED",
      });

      const forbidden = await fetch(`${gatewayUrl}${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${viewerToken}`,
          "content-type": "application/json",
        },
        body: "{}",
      });
      expect(forbidden.status, path).toBe(403);
      expect(await forbidden.json(), path).toMatchObject({
        success: false,
        error: "Acesso negado para esta rota.",
        code: "FORBIDDEN",
      });
    }

    expect(upstreamHits).toBe(0);
  } finally {
    await stopServer(gateway);
    await stopServer(taskService);
  }
});

it("keeps project-wizard request data out of gateway logs and audit", async () => {
  const privateValues = [
    "ATA-PRIVADA-995",
    "CLIENTE-PRIVADO-995",
    "responsavel.privado@example.invalid",
  ];
  const auditService = await startAuditIngestServer();
  const taskService = createServer((_request, response) => {
    response.statusCode = 502;
    response.setHeader("content-type", "application/json");
    response.end(
      JSON.stringify({
        success: false,
        error: "Não foi possível extrair tarefas da Ata inteira.",
        code: "BAD_GATEWAY",
      }),
    );
  });
  const taskServiceUrl = await startServer(taskService);
  const { logger, stream } = createCapturedTestLogger();
  const gateway = createServer(
    createApp(
      createEnv({ auditEnabled: true, auditServiceUrl: auditService.url, taskServiceUrl }),
      logger,
    ),
  );
  const gatewayUrl = await startServer(gateway);
  const token = createToken({
    user_id: "wizard-user",
    organization_id: "wizard-org",
    permission: 0,
    type: "user",
    modules: { integracao: 2 },
  });

  try {
    const response = await fetch(`${gatewayUrl}/task/project-wizard/extract-tasks`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        content: privateValues[0],
        client_name: privateValues[1],
        responsible_email: privateValues[2],
      }),
    });

    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({
      success: false,
      error: "Não foi possível extrair tarefas da Ata inteira.",
      code: "BAD_GATEWAY",
    });
    await waitForRecords(auditService.records, 1);
    await waitForLogs();

    const observability = JSON.stringify({ audit: auditService.records, logs: stream.entries() });
    for (const privateValue of privateValues) {
      expect(observability).not.toContain(privateValue);
    }
  } finally {
    await stopServer(gateway);
    await stopServer(taskService);
    await stopServer(auditService.server);
  }
});

it("proxies project-service routes mapped in the gateway", async () => {
  const token = createToken({
    user_id: "user-1",
    organization_id: "org-1",
    permission: 2,
    modules: { integracao: 1 },
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
    expect(seenPermission).toBe("3");
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

it("proxies /parcelamento requests and forwards the owner permission", async () => {
  const token = createToken({
    user_id: "user-1",
    organization_id: "org-1",
    permission: 2,
    modules: { parcelamento: 0 },
  });
  let upstreamHits = 0;
  let seenPermission: string | undefined;
  const parcelamentoService = createServer((request, response) => {
    upstreamHits += 1;
    seenPermission = request.headers[FORWARDED_AUTH_PERMISSION_HEADER] as string | undefined;
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

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(upstreamHits).toBe(1);
    expect(seenPermission).toBe("3");
  } finally {
    await stopServer(gateway);
    await stopServer(parcelamentoService);
  }
});

it("forwards the parcelamento module permission to the upstream", async () => {
  const token = createToken({
    user_id: "user-1",
    organization_id: "org-1",
    permission: 0,
    modules: { parcelamento: 1 },
  });
  let seenPermission: string | undefined;
  const parcelamentoService = createServer((request, response) => {
    seenPermission = request.headers[FORWARDED_AUTH_PERMISSION_HEADER] as string | undefined;
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
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(200);
    expect(seenPermission).toBe("1");
  } finally {
    await stopServer(gateway);
    await stopServer(parcelamentoService);
  }
});

it("blocks a user without parcelamento permission before proxying", async () => {
  const token = createToken({
    user_id: "user-1",
    organization_id: "org-1",
    permission: 0,
    modules: { parcelamento: 0 },
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
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(403);
    expect(body.code).toBe("FORBIDDEN");
    expect(upstreamHits).toBe(0);
  } finally {
    await stopServer(gateway);
    await stopServer(parcelamentoService);
  }
});

it("proxies Parcelamento read routes for Viewer without exposing mutations", async () => {
  const token = createToken({
    user_id: "user-1",
    organization_id: "org-1",
    permission: 0,
    modules: { parcelamento: 1 },
  });
  const seenUrls: string[] = [];
  const parcelamentoService = createServer((request, response) => {
    seenUrls.push(request.url ?? "");
    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ success: true, data: { ok: true } }));
  });
  const parcelamentoServiceUrl = await startServer(parcelamentoService);
  const app = createApp(createEnv({ parcelamentoServiceUrl }), createTestLogger());
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);
  const headers = { Authorization: `Bearer ${token}` };
  const readPaths = [
    "/parcelamento/installments",
    "/parcelamento/installments/installment-1/competencies",
    "/parcelamento/panoramas",
  ];
  const mutationRequests = [
    ["POST", "/parcelamento/installments"],
    ["PATCH", "/parcelamento/installments/installment-1"],
    ["POST", "/parcelamento/installments/installment-1/competencies"],
    ["PATCH", "/parcelamento/installment-competencies/competency-1"],
    ["POST", "/parcelamento/panoramas"],
    ["PATCH", "/parcelamento/panoramas/panorama-1"],
    ["POST", "/parcelamento/panoramas/competences/2026-07/generate"],
  ] as const;

  try {
    for (const path of readPaths) {
      const response = await fetch(`${gatewayUrl}${path}`, { headers });
      expect(response.status).toBe(200);
    }

    for (const [method, path] of mutationRequests) {
      const response = await fetch(`${gatewayUrl}${path}`, {
        method,
        headers: { ...headers, "content-type": "application/json" },
        body: "{}",
      });
      expect(response.status).toBe(403);
    }

    expect(seenUrls).toEqual(readPaths);
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
    type: "user",
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

it("allows certificate Viewers to list, filter and open PJ and PF records", async () => {
  const token = createToken({
    user_id: "user-1",
    organization_id: "org-1",
    permission: 1,
    type: "user",
    modules: { certificado: 1 },
  });
  const seenRequests: Array<{ path: string; permission?: string }> = [];
  const certificateService = createServer((request, response) => {
    seenRequests.push({
      path: request.url ?? "",
      permission: request.headers[FORWARDED_AUTH_PERMISSION_HEADER] as string | undefined,
    });
    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ success: true, data: { ok: true } }));
  });
  const certificateServiceUrl = await startServer(certificateService);
  const app = createApp(createEnv({ certificateServiceUrl }), createTestLogger());
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);
  const certificateId = "20000000-0000-4000-8000-000000000001";

  try {
    const paths = [
      "/certificate/pj/list?name=Castelo",
      `/certificate/pj/${certificateId}`,
      "/certificate/pf/list?search=Joao",
      `/certificate/pf/${certificateId}`,
    ];
    const statuses: number[] = [];
    for (const path of paths) {
      const response = await fetch(`${gatewayUrl}${path}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      statuses.push(response.status);
    }

    expect(statuses).toEqual([200, 200, 200, 200]);
    expect(seenRequests).toEqual(
      paths.map((path) => ({
        path,
        permission: "1",
      })),
    );
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
    expect(seenPermission).toBe("3");
  } finally {
    await stopServer(gateway);
    await stopServer(certificateService);
  }
});

it("denies certificate routes for users without modular certificate permission", async () => {
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

    expect(response.status).toBe(403);
    expect(seenPermission).toBeUndefined();
  } finally {
    await stopServer(gateway);
    await stopServer(certificateService);
  }
});

it("denies unclassified internal notification routes through the gateway", async () => {
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

    expect(response.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error).toBe("Acesso negado para esta rota.");
  } finally {
    await stopServer(server);
  }
});

it("denies authenticated routes not mapped to an explicit policy", async () => {
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

    expect(response.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error).toBe("Acesso negado para esta rota.");
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

it("records TI password deactivation without body or query secrets", async () => {
  const token = createToken({
    user_id: "user-1",
    organization_id: "org-1",
    permission: 2,
  });
  const auditService = await startAuditIngestServer();
  const upstream = createServer(async (request, response) => {
    await readJsonBody(request);
    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ success: true, data: { active: false } }));
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
    const response = await fetch(
      `${gatewayUrl}/ti/passwords/9a68a809-9a78-4ef9-94d0-b9bb9787ad2e/deactivate?reason=query-secret&password=query-password&ticket=TI-507`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ reason: "Contains private administrative context" }),
      },
    );

    expect(response.status).toBe(200);
    await waitForRecords(auditService.records, 1);

    expect(auditService.records[0]).toMatchObject({
      organizationId: "org-1",
      userId: "user-1",
      method: "POST",
      path: "/ti/passwords/9a68a809-9a78-4ef9-94d0-b9bb9787ad2e/deactivate",
      outcome: "success",
      action: "inativou",
      referring: "uma credencial de TI",
      metadata: {
        routeTarget: "ti-service",
        activityVisible: true,
      },
    });
    expect(auditService.records[0]?.query).toEqual({ ticket: "TI-507" });
    expect(auditService.records[0]?.createdAt).toEqual(expect.any(String));
    expect(auditService.records[0]?.finishedAt).toEqual(expect.any(String));
    const serializedAuditRecord = JSON.stringify(auditService.records[0]);
    expect(serializedAuditRecord).not.toContain("Contains private administrative context");
    expect(serializedAuditRecord).not.toContain("query-secret");
    expect(serializedAuditRecord).not.toContain("query-password");
    expect(serializedAuditRecord).not.toContain('"reason"');
    expect(serializedAuditRecord).not.toContain('"password"');
  } finally {
    await stopServer(gateway);
    await stopServer(upstream);
    await stopServer(auditService.server);
  }
});

it.each([
  {
    variant: "trailing slash",
    requestPath: "/ti/passwords/9a68a809-9a78-4ef9-94d0-b9bb9787ad2e/deactivate/",
    expectedPath: "/ti/passwords/9a68a809-9a78-4ef9-94d0-b9bb9787ad2e/deactivate/",
  },
  {
    variant: "different casing",
    requestPath: "/TI/PASSWORDS/9a68a809-9a78-4ef9-94d0-b9bb9787ad2e/DEACTIVATE",
    expectedPath: "/TI/PASSWORDS/9a68a809-9a78-4ef9-94d0-b9bb9787ad2e/DEACTIVATE",
  },
])("sanitizes TI password deactivation audit with $variant", async ({
  requestPath,
  expectedPath,
}) => {
  const token = createToken({
    user_id: "user-1",
    organization_id: "org-1",
    permission: 2,
    modules: { ti: 2 },
  });
  const auditService = await startAuditIngestServer();
  const upstream = createServer(async (request, response) => {
    await readJsonBody(request);
    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ success: true, data: { active: false } }));
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
    const response = await fetch(
      `${gatewayUrl}${requestPath}?reason=secret&password=query-password&ticket=TI-507`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ reason: "Valid administrative reason" }),
      },
    );

    expect(response.status).toBe(200);
    await waitForRecords(auditService.records, 1);

    expect(auditService.records[0]).toMatchObject({
      organizationId: "org-1",
      userId: "user-1",
      method: "POST",
      path: expectedPath,
      statusCode: 200,
      outcome: "success",
    });
    expect(auditService.records[0]?.query).toEqual({ ticket: "TI-507" });
    expect(auditService.records[0]?.createdAt).toEqual(expect.any(String));
    expect(auditService.records[0]?.finishedAt).toEqual(expect.any(String));

    const serializedAuditRecord = JSON.stringify(auditService.records[0]);
    expect(serializedAuditRecord).not.toContain("Valid administrative reason");
    expect(serializedAuditRecord).not.toContain("secret");
    expect(serializedAuditRecord).not.toContain("query-password");
    expect(serializedAuditRecord).not.toContain('"reason"');
    expect(serializedAuditRecord).not.toContain('"password"');
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

it("records parcelamento-service route targets when audit is enabled", async () => {
  const token = createToken({
    user_id: "user-1",
    organization_id: "org-1",
    permission: 3,
    modules: { parcelamento: 1 },
  });
  const auditService = await startAuditIngestServer();
  const upstream = createServer((_request, response) => {
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

    expect(response.status).toBe(200);
    await waitForRecords(auditService.records, 1);
    expect(auditService.records[0]?.metadata?.routeTarget).toBe("parcelamento-service");
  } finally {
    await stopServer(gateway);
    await stopServer(upstream);
    await stopServer(auditService.server);
  }
});

it("records reports-service route targets when audit is enabled", async () => {
  const token = createToken({
    user_id: "user-1",
    organization_id: "org-1",
    permission: 2,
  });
  const auditService = await startAuditIngestServer();
  const upstream = createServer((_request, response) => {
    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ success: true, data: { sources: [] } }));
  });
  const reportsServiceUrl = await startServer(upstream);

  const app = createApp(
    createEnv({
      auditEnabled: true,
      auditServiceUrl: auditService.url,
      reportsServiceUrl,
    }),
    createTestLogger(),
  );
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);

  try {
    const response = await fetch(`${gatewayUrl}/reports/catalog`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(200);
    await waitForRecords(auditService.records, 1);
    expect(auditService.records[0]?.metadata?.routeTarget).toBe("reports-service");
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
  const upstream = createServer();
  const upstreamReceivedRequest = once(upstream, "request", { signal: AbortSignal.timeout(1_000) });
  const taskServiceUrl = await startServer(upstream);
  const { logger, stream } = createCapturedTestLogger();
  const app = createApp(createEnv({ taskServiceUrl }), logger);
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);
  const { port } = new URL(gatewayUrl);

  try {
    const request = nodeRequest({
      hostname: "localhost",
      family: 4,
      lookup: (_hostname, _options, callback) => {
        // Simula conexão lenta: abortar por timer poderia impedir a chegada ao gateway.
        setTimeout(() => callback(null, "127.0.0.1", 4), 50);
      },
      port,
      path: "/task/list",
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
    const requestAborted = new Promise<void>((resolve) => request.once("error", () => resolve()));
    request.end();

    const [, upstreamResponse] = await upstreamReceivedRequest;
    request.destroy();
    await requestAborted;
    await vi.waitFor(() => {
      expect(
        stream.entries().filter((entry) => entry.event === "http.request.aborted"),
      ).toHaveLength(1);
    });
    upstreamResponse.end(JSON.stringify({ success: true, data: { ok: true } }));
    await waitForLogs();

    const abortedLogs = stream.entries().filter((entry) => entry.event === "http.request.aborted");
    expect(abortedLogs).toHaveLength(1);
  } finally {
    gateway.closeAllConnections();
    upstream.closeAllConnections();
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

it("does not send health probes to the audit service", async () => {
  const auditService = await startAuditIngestServer();
  const app = createApp(
    createEnv({ auditEnabled: true, auditServiceUrl: auditService.url }),
    createTestLogger(),
  );
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);

  try {
    expect((await fetch(`${gatewayUrl}/health`)).status).toBe(200);
    expect((await fetch(`${gatewayUrl}/ready`)).status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(auditService.records).toHaveLength(0);
  } finally {
    await stopServer(gateway);
    await stopServer(auditService.server);
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

it("allows Viewers without client-related module permission to proxy /client/list", async () => {
  const token = createToken({
    user_id: "user-1",
    organization_id: "org-1",
    permission: 1,
    modules: {
      atendimento: 2,
    },
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
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(seenUrl).toBe("/client/list");
  } finally {
    await stopServer(gateway);
    await stopServer(upstream);
  }
});

it("allows Integration viewers to proxy client list", async () => {
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

it("allows Integration viewers without global permission to proxy client list", async () => {
  const token = createToken({
    user_id: "user-1",
    organization_id: "org-1",
    permission: 0,
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

it("does not authorize client routes with a retired atendimento permission", async () => {
  const token = createToken({
    user_id: "user-1",
    organization_id: "org-1",
    permission: 1,
    modules: { atendimento: 2 },
  });
  let upstreamHits = 0;
  const upstream = createServer((_request, response) => {
    upstreamHits += 1;
    response.statusCode = 200;
    response.end(JSON.stringify({ success: true }));
  });
  const clientServiceUrl = await startServer(upstream);
  const app = createApp(createEnv({ clientServiceUrl }), createTestLogger());
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);

  try {
    const response = await fetch(`${gatewayUrl}/client`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(403);
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

it("forwards the authenticated Integration context to client-service", async () => {
  const token = createToken({
    user_id: "user-1",
    organization_id: "org-1",
    permission: 1,
    type: "user",
    modules: { integracao: 2 },
  });
  let seenHeaders: Record<string, string | undefined> = {};

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
    response.end(JSON.stringify({ success: true, data: { proxied: true } }));
  });
  const clientServiceUrl = await startServer(upstream);
  const app = createApp(createEnv({ clientServiceUrl }), createTestLogger());
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);

  try {
    const response = await fetch(`${gatewayUrl}/client/client-1`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: "Cliente atualizado" }),
    });

    expect(response.status).toBe(200);
    expect(seenHeaders).toMatchObject({
      internalToken: "client-service-token",
      userId: "user-1",
      organizationId: "org-1",
      permission: "1",
      type: "user",
    });
    expect(JSON.parse(seenHeaders.modules ?? "{}")).toMatchObject({ integracao: 2 });
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

it("allows Contabil module users to load RH operational users for selectors", async () => {
  const token = createToken({
    user_id: "contabil-admin",
    organization_id: "org-1",
    permission: 1,
    type: "admin",
    modules: { contabil: 3, rh: 0 },
  });
  let seenModules: string | undefined;

  const upstream = createServer((request, response) => {
    seenModules = request.headers[FORWARDED_AUTH_MODULES_HEADER] as string | undefined;
    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ success: true, data: [] }));
  });
  const rhServiceUrl = await startServer(upstream);

  const app = createApp(createEnv({ rhServiceUrl }), createTestLogger());
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);

  try {
    const response = await fetch(`${gatewayUrl}/rh/operational-users`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(200);
    expect(JSON.parse(seenModules ?? "{}")).toMatchObject({ contabil: 3, rh: 0 });
  } finally {
    await stopServer(gateway);
    await stopServer(upstream);
  }
});

it("allows Triagem module users to load RH operational users for link selectors", async () => {
  const token = createToken({
    user_id: "triagem-editor",
    organization_id: "org-1",
    permission: 0,
    type: "user",
    modules: { triagem: 2, rh: 0 },
  });
  let upstreamHits = 0;

  const upstream = createServer((_request, response) => {
    upstreamHits += 1;
    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ success: true, data: [] }));
  });
  const rhServiceUrl = await startServer(upstream);

  const app = createApp(createEnv({ rhServiceUrl }), createTestLogger());
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);

  try {
    const response = await fetch(`${gatewayUrl}/rh/operational-users`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(200);
    expect(upstreamHits).toBe(1);
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

it("blocks pessoal mutations from Viewers before reaching the upstream", async () => {
  const token = createToken({
    user_id: "user-1",
    organization_id: "org-1",
    permission: 1,
    modules: { pessoal: 1 },
  });
  let upstreamHits = 0;

  const upstream = createServer((_request, response) => {
    upstreamHits += 1;
    response.statusCode = 201;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ success: true, data: { proxied: true } }));
  });
  const pessoalServiceUrl = await startServer(upstream);

  const app = createApp(createEnv({ pessoalServiceUrl }), createTestLogger());
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);

  try {
    const response = await fetch(`${gatewayUrl}/pessoal/unions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: "Sindicato", cnpj: "123" }),
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

it("denies Fiscal routes when the user lacks the module read level", async () => {
  const token = createToken({
    user_id: "user-1",
    organization_id: "org-1",
    permission: 1,
    modules: { fiscal: 0 },
  });
  let seenPermission: string | undefined;
  let seenInternalToken: string | undefined;
  const upstream = createServer((request, response) => {
    seenPermission = request.headers[FORWARDED_AUTH_PERMISSION_HEADER] as string | undefined;
    seenInternalToken = request.headers[INTERNAL_SERVICE_TOKEN_HEADER] as string | undefined;
    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ success: true, data: { proxied: true } }));
  });
  const fiscalServiceUrl = await startServer(upstream);

  const app = createApp(createEnv({ fiscalServiceUrl }), createTestLogger());
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);

  try {
    const response = await fetch(`${gatewayUrl}/fiscal/ncm/list`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(403);
    expect(seenPermission).toBeUndefined();
    expect(seenInternalToken).toBeUndefined();
  } finally {
    await stopServer(gateway);
    await stopServer(upstream);
  }
});

it("denies Contabil routes when the user lacks the module read level", async () => {
  const token = createToken({
    user_id: "user-1",
    organization_id: "org-1",
    permission: 1,
    modules: { contabil: 0 },
  });
  let seenPermission: string | undefined;
  let seenInternalToken: string | undefined;
  const upstream = createServer((request, response) => {
    seenPermission = request.headers[FORWARDED_AUTH_PERMISSION_HEADER] as string | undefined;
    seenInternalToken = request.headers[INTERNAL_SERVICE_TOKEN_HEADER] as string | undefined;
    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ success: true, data: { proxied: true } }));
  });
  const contabilServiceUrl = await startServer(upstream);

  const app = createApp(createEnv({ contabilServiceUrl }), createTestLogger());
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);

  try {
    const response = await fetch(`${gatewayUrl}/contabil/controls`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(403);
    expect(seenPermission).toBeUndefined();
    expect(seenInternalToken).toBeUndefined();
  } finally {
    await stopServer(gateway);
    await stopServer(upstream);
  }
});

it("denies Contabil routes when module claims are absent", async () => {
  const token = createToken({
    user_id: "user-1",
    organization_id: "org-1",
    permission: 1,
  });
  let seenPermission: string | undefined;
  const upstream = createServer((request, response) => {
    seenPermission = request.headers[FORWARDED_AUTH_PERMISSION_HEADER] as string | undefined;
    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ success: true, data: { proxied: true } }));
  });
  const contabilServiceUrl = await startServer(upstream);

  const app = createApp(createEnv({ contabilServiceUrl }), createTestLogger());
  const gateway = createServer(app);
  const gatewayUrl = await startServer(gateway);

  try {
    const response = await fetch(`${gatewayUrl}/contabil/controls`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(403);
    expect(seenPermission).toBeUndefined();
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
