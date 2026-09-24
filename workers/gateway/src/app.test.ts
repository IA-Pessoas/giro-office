import { createCsrfToken, hashCsrfToken } from "@workspace/runtime";
import {
  FORWARDED_AUTH_CSRF_HASH_HEADER,
  FORWARDED_AUTH_SESSION_ID_HEADER,
  FORWARDED_AUTH_SESSION_VERSION_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
  REQUEST_ID_HEADER,
} from "@workspace/shared/http";
import { describe, expect, it, vi } from "vitest";
import { createAuditWorkerApp } from "../../audit-service/src/app.js";
import type { AuditWorkerEnv } from "../../audit-service/src/env.js";
import type { AuditRequestRepository } from "../../audit-service/src/repository.js";
import { createGatewayWorkerApp } from "./app.js";
import type { GatewayWorkerEnv } from "./env.js";

const SECRET = "gateway-worker-test-secret-with-enough-length";
const TOKEN = "gateway-internal-token";
const AUDIT_TOKEN = "gateway-audit-token";

function env(
  binding?: { fetch: ReturnType<typeof vi.fn> },
  extras: Partial<GatewayWorkerEnv> = {},
): GatewayWorkerEnv {
  return {
    JWT_SECRET: SECRET,
    INTERNAL_SERVICE_TOKEN: TOKEN,
    AUDIT_SERVICE_TOKEN: AUDIT_TOKEN,
    AUDIT_SERVICE: {
      fetch: vi.fn(async () => new Response(null, { status: 201 })),
    },
    DEPARTMENT_SERVICE: binding,
    ...extras,
  };
}

function auditRepository(): AuditRequestRepository {
  return {
    create: vi.fn(async () => undefined),
    search: vi.fn(async () => ({ items: [], total: 0, page: 1, pageSize: 50 })),
    searchPlatform: vi.fn(async () => ({ items: [], total: 0, page: 1, pageSize: 50 })),
    findByRequestId: vi.fn(async () => null),
  };
}

function auditEnv(): AuditWorkerEnv {
  return {
    AUDIT_ENABLED: "true",
    INTERNAL_SERVICE_TOKEN: AUDIT_TOKEN,
    JWT_SECRET: SECRET,
  };
}

function base64url(value: string | Uint8Array): string {
  return Buffer.from(value).toString("base64url");
}

async function signJwt(payload: Record<string, unknown>): Promise<string> {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64url(JSON.stringify(payload));
  const input = `${header}.${body}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(input));
  return `${input}.${base64url(new Uint8Array(signature))}`;
}

async function jwt(csrfHash?: string, session?: Record<string, unknown>): Promise<string> {
  return signJwt({
    user_id: "user-1",
    organization_id: "org-1",
    auth_kind: "organization",
    type: "owner",
    // `minPermission` não tem atalho de owner no canAccessRoute: exige a claim numérica.
    permission: 3,
    modules: { contabil: 2 },
    ...(csrfHash ? { csrf_hash: csrfHash } : {}),
    ...session,
  });
}

describe("gateway Worker", () => {
  it("serves health and counts configured bindings", async () => {
    const app = createGatewayWorkerApp({ env: env({ fetch: vi.fn() }) });
    expect(await (await app.request("https://gateway.test/health")).json()).toEqual({
      success: true,
      data: { status: "ok", service: "gateway" },
    });
    expect(await (await app.request("https://gateway.test/ready")).json()).toMatchObject({
      data: { services: 2 },
    });
  });

  it("rejects protected proxy calls without authentication", async () => {
    const binding = { fetch: vi.fn() };
    const app = createGatewayWorkerApp({ env: env(binding) });
    expect((await app.request("https://gateway.test/department")).status).toBe(401);
    expect(binding.fetch).not.toHaveBeenCalled();
  });

  it("forwards identity headers through the Service Binding", async () => {
    const binding = {
      fetch: vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 })),
    };
    const app = createGatewayWorkerApp({ env: env(binding) });
    const response = await app.request("https://gateway.test/department", {
      headers: { authorization: `Bearer ${await jwt()}` },
    });
    expect(response.status).toBe(200);
    const forwarded = binding.fetch.mock.calls[0]?.[0] as Request;
    expect(forwarded.headers.get("x-internal-service-token")).toBe(TOKEN);
    expect(forwarded.headers.get("x-auth-organization-id")).toBe("org-1");
  });

  it("audits authenticated proxy responses with a dedicated token and safe request data", async () => {
    const binding = {
      fetch: vi.fn(async () => new Response("ok", { status: 200 })),
    };
    const auditBinding = {
      fetch: vi.fn(async () => new Response(null, { status: 201 })),
    };
    const app = createGatewayWorkerApp({
      env: env(binding, { AUDIT_SERVICE: auditBinding, AUDIT_SERVICE_TOKEN: AUDIT_TOKEN }),
    });

    const response = await app.request(
      "https://gateway.test/department?view=summary&access_token=jwt-value&tag=one&tag=two",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${await jwt(undefined, { permission: 3 })}`,
          [REQUEST_ID_HEADER]: "request-123",
          cookie: "analytics=jwt-cookie-value",
        },
        body: "request-body-secret",
      },
    );

    expect(response.status).toBe(200);
    expect(auditBinding.fetch).toHaveBeenCalledOnce();

    const forwarded = binding.fetch.mock.calls[0]?.[0] as Request;
    expect(forwarded.headers.get(REQUEST_ID_HEADER)).toBe("request-123");
    const auditRequest = auditBinding.fetch.mock.calls[0]?.[0] as Request;
    expect(auditRequest.url).toBe("https://audit-service.internal/internal/audit/requests");
    expect(auditRequest.headers.get(INTERNAL_SERVICE_TOKEN_HEADER)).toBe(AUDIT_TOKEN);
    expect(auditRequest.headers.get(INTERNAL_SERVICE_TOKEN_HEADER)).not.toBe(TOKEN);

    const payload = (await auditRequest.json()) as Record<string, unknown>;
    expect(payload).toMatchObject({
      requestId: "request-123",
      organizationId: "org-1",
      userId: "user-1",
      permission: 3,
      method: "POST",
      path: "/department",
      query: {
        view: "summary",
        access_token: "[REDACTED]",
        tag: ["one", "two"],
      },
      statusCode: 200,
      outcome: "success",
      serviceSource: "gateway-worker",
      metadata: {
        actorKind: "organization",
        routeTarget: "DEPARTMENT_SERVICE",
        routePrefix: "/department",
      },
    });
    expect(payload).not.toHaveProperty("body");
    expect(JSON.stringify(payload)).not.toContain("jwt-cookie-value");
    expect(JSON.stringify(payload)).not.toContain("jwt-value");
    expect(Date.parse(String(payload.createdAt))).not.toBeNaN();
    expect(Date.parse(String(payload.finishedAt))).not.toBeNaN();
    expect(payload.durationMs).toEqual(expect.any(Number));
  });

  it("sends prototype-like query keys as a payload accepted by the Audit Worker", async () => {
    const binding = {
      fetch: vi.fn(async () => new Response("ok", { status: 200 })),
    };
    const repository = auditRepository();
    const auditApp = createAuditWorkerApp({ env: auditEnv(), repository });
    const auditRequests: Request[] = [];
    const auditBinding = {
      fetch: vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(input, init);
        auditRequests.push(request.clone());
        return auditApp.fetch(request);
      }),
    };
    const app = createGatewayWorkerApp({
      env: env(binding, { AUDIT_SERVICE: auditBinding, AUDIT_SERVICE_TOKEN: AUDIT_TOKEN }),
    });

    const response = await app.request(
      "https://gateway.test/department?toString=one&constructor=two&__proto__=three",
      { headers: { authorization: `Bearer ${await jwt()}` } },
    );

    expect(response.status).toBe(200);
    expect(auditBinding.fetch).toHaveBeenCalledOnce();
    expect(repository.create).toHaveBeenCalledOnce();
    const sentPayload = (await auditRequests[0]?.json()) as {
      query?: Record<string, unknown>;
    };
    expect(Object.hasOwn(sentPayload.query ?? {}, "toString")).toBe(true);
    expect(Object.hasOwn(sentPayload.query ?? {}, "constructor")).toBe(true);
    expect(Object.hasOwn(sentPayload.query ?? {}, "__proto__")).toBe(true);
    expect(sentPayload.query?.toString).toBe("one");
    expect(sentPayload.query?.constructor).toBe("two");
    expect(sentPayload.query?.__proto__).toBe("three");
  });

  it("generates and forwards a request id when the caller did not provide one", async () => {
    const binding = {
      fetch: vi.fn(async () => new Response("ok", { status: 200 })),
    };
    const auditBinding = {
      fetch: vi.fn(async () => new Response(null, { status: 201 })),
    };
    const app = createGatewayWorkerApp({
      env: env(binding, { AUDIT_SERVICE: auditBinding, AUDIT_SERVICE_TOKEN: AUDIT_TOKEN }),
    });

    const response = await app.request("https://gateway.test/department", {
      headers: { authorization: `Bearer ${await jwt()}` },
    });

    const requestId = response.headers.get(REQUEST_ID_HEADER);
    expect(requestId).toEqual(expect.any(String));
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/u);
    expect((binding.fetch.mock.calls[0]?.[0] as Request).headers.get(REQUEST_ID_HEADER)).toBe(
      requestId,
    );
    expect((await (auditBinding.fetch.mock.calls[0]?.[0] as Request).json()).requestId).toBe(
      requestId,
    );
  });

  it.each([
    [201, "success"],
    [404, "error"],
    [500, "error"],
  ] as const)("records the upstream outcome for HTTP %s", async (status, outcome) => {
    const binding = {
      fetch: vi.fn(async () => new Response(null, { status })),
    };
    const auditBinding = {
      fetch: vi.fn(async () => new Response(null, { status: 201 })),
    };
    const app = createGatewayWorkerApp({
      env: env(binding, { AUDIT_SERVICE: auditBinding, AUDIT_SERVICE_TOKEN: AUDIT_TOKEN }),
    });

    const response = await app.request("https://gateway.test/department", {
      headers: { authorization: `Bearer ${await jwt()}` },
    });

    expect(response.status).toBe(status);
    expect((await (auditBinding.fetch.mock.calls[0]?.[0] as Request).json()).outcome).toBe(outcome);
  });

  it("records an aborted outcome when the upstream binding throws", async () => {
    const binding = {
      fetch: vi.fn(async () => {
        throw new Error("upstream-secret");
      }),
    };
    const auditBinding = {
      fetch: vi.fn(async () => new Response(null, { status: 201 })),
    };
    const app = createGatewayWorkerApp({
      env: env(binding, { AUDIT_SERVICE: auditBinding, AUDIT_SERVICE_TOKEN: AUDIT_TOKEN }),
    });

    const response = await app.request("https://gateway.test/department", {
      headers: { authorization: `Bearer ${await jwt()}` },
    });

    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({
      success: false,
      code: "BAD_GATEWAY",
      requestId: expect.any(String),
    });
    expect(await (auditBinding.fetch.mock.calls[0]?.[0] as Request).json()).toMatchObject({
      outcome: "aborted",
      statusCode: 502,
      errorCode: "UPSTREAM_EXCEPTION",
    });
  });

  it("surfaces audit delivery failures for mutations", async () => {
    const binding = {
      fetch: vi.fn(async () => new Response(null, { status: 204 })),
    };
    const auditBinding = {
      fetch: vi.fn(async () => new Response(null, { status: 503 })),
    };
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const app = createGatewayWorkerApp({
      env: env(binding, { AUDIT_SERVICE: auditBinding, AUDIT_SERVICE_TOKEN: AUDIT_TOKEN }),
    });

    const response = await app.request("https://gateway.test/department", {
      method: "POST",
      headers: { authorization: `Bearer ${await jwt()}` },
    });

    expect(response.status).toBe(503);
    expect(binding.fetch).toHaveBeenCalledOnce();
    expect(auditBinding.fetch).toHaveBeenCalledOnce();
    expect(errorSpy).toHaveBeenCalledWith(
      "[gateway-worker] falha ao enviar auditoria",
      expect.objectContaining({ statusCode: 204, outcome: "success" }),
    );
    errorSpy.mockRestore();
  });

  it("does not proxy mutations without audit configuration and never audits audit routes", async () => {
    const mutationBinding = { fetch: vi.fn(async () => new Response("changed", { status: 200 })) };
    const auditRouteBinding = {
      fetch: vi.fn(async () => new Response("audit", { status: 200 })),
    };
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const app = createGatewayWorkerApp({
      env: env(mutationBinding, {
        AUDIT_SERVICE: auditRouteBinding,
        AUDIT_SERVICE_TOKEN: undefined,
      }),
    });

    const mutation = await app.request("https://gateway.test/department", {
      method: "POST",
      headers: { authorization: `Bearer ${await jwt()}` },
    });
    const auditRoute = await app.request("https://gateway.test/audit/requests", {
      headers: { authorization: `Bearer ${await jwt()}` },
    });

    expect(mutation.status).toBe(503);
    expect(mutationBinding.fetch).not.toHaveBeenCalled();
    expect(auditRoute.status).toBe(200);
    expect(auditRouteBinding.fetch).toHaveBeenCalledOnce();
    expect(errorSpy).toHaveBeenCalledWith(
      "[gateway-worker] AUDIT_SERVICE_TOKEN ausente; auditoria não será enviada.",
    );
    errorSpy.mockRestore();
  });

  it("rejects reusing the internal token for audit", async () => {
    const binding = { fetch: vi.fn(async () => new Response("ok", { status: 200 })) };
    const auditBinding = { fetch: vi.fn(async () => new Response(null, { status: 201 })) };
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const app = createGatewayWorkerApp({
      env: env(binding, { AUDIT_SERVICE: auditBinding, AUDIT_SERVICE_TOKEN: TOKEN }),
    });

    const response = await app.request("https://gateway.test/department", {
      method: "POST",
      headers: { authorization: `Bearer ${await jwt()}` },
    });

    expect(response.status).toBe(503);
    expect(binding.fetch).not.toHaveBeenCalled();
    expect(auditBinding.fetch).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      "[gateway-worker] AUDIT_SERVICE_TOKEN deve ser distinto de INTERNAL_SERVICE_TOKEN.",
    );
    errorSpy.mockRestore();
  });

  it.each([
    "binding",
    "token",
  ] as const)("fails closed for authenticated reads when the audit %s is absent", async (missing) => {
    const binding = { fetch: vi.fn(async () => new Response("ok", { status: 200 })) };
    const auditBinding = { fetch: vi.fn(async () => new Response(null, { status: 201 })) };
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const app = createGatewayWorkerApp({
      env: env(
        binding,
        missing === "binding"
          ? { AUDIT_SERVICE: undefined }
          : { AUDIT_SERVICE_TOKEN: undefined, AUDIT_SERVICE: auditBinding },
      ),
    });

    const response = await app.request("https://gateway.test/department", {
      headers: { authorization: `Bearer ${await jwt()}` },
    });

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      success: false,
      code: "SERVICE_UNAVAILABLE",
      requestId: expect.any(String),
    });
    expect(binding.fetch).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("forwards only authenticated session claims and overwrites spoofed headers", async () => {
    const binding = {
      fetch: vi.fn(async () => new Response("ok", { status: 200 })),
    };
    const csrfHash = "a".repeat(64);
    const sessionToken = await jwt(csrfHash, {
      session_id: "gateway-session",
      session_version: 7,
    });
    const app = createGatewayWorkerApp({ env: env(undefined, { TI_SERVICE: binding }) });

    const response = await app.request("https://gateway.test/ti", {
      headers: {
        cookie: `cw.session=${sessionToken}`,
        [FORWARDED_AUTH_SESSION_ID_HEADER]: "spoofed-session",
        [FORWARDED_AUTH_SESSION_VERSION_HEADER]: "999",
        [FORWARDED_AUTH_CSRF_HASH_HEADER]: "f".repeat(64),
      },
    });

    expect(response.status).toBe(200);
    const forwarded = binding.fetch.mock.calls[0]?.[0] as Request;
    expect(forwarded.headers.get(FORWARDED_AUTH_SESSION_ID_HEADER)).toBe("gateway-session");
    expect(forwarded.headers.get(FORWARDED_AUTH_SESSION_VERSION_HEADER)).toBe("7");
    expect(forwarded.headers.get(FORWARDED_AUTH_CSRF_HASH_HEADER)).toBe(csrfHash);
  });

  it("routes the project and TI pilots through their bindings", async () => {
    const projectBinding = {
      fetch: vi.fn(async () => new Response("project", { status: 200 })),
    };
    const tiBinding = {
      fetch: vi.fn(async () => new Response("ti", { status: 200 })),
    };
    const rhBinding = {
      fetch: vi.fn(async () => new Response("rh", { status: 200 })),
    };
    const commercialBinding = {
      fetch: vi.fn(async () => new Response("commercial", { status: 200 })),
    };
    const triagemBinding = {
      fetch: vi.fn(async () => new Response("triagem", { status: 200 })),
    };
    const pessoalBinding = {
      fetch: vi.fn(async () => new Response("pessoal", { status: 200 })),
    };
    const regularizeBinding = {
      fetch: vi.fn(async () => new Response("regularize", { status: 200 })),
    };
    const app = createGatewayWorkerApp({
      env: env(undefined, {
        PROJECT_SERVICE: projectBinding,
        TI_SERVICE: tiBinding,
        RH_SERVICE: rhBinding,
        COMMERCIAL_SERVICE: commercialBinding,
        TRIAGEM_SERVICE: triagemBinding,
        PESSOAL_SERVICE: pessoalBinding,
        REGULARIZE_SERVICE: regularizeBinding,
      }),
    });

    const project = await app.request("https://gateway.test/project", {
      headers: { authorization: `Bearer ${await jwt()}` },
    });
    const ti = await app.request("https://gateway.test/ti", {
      headers: { authorization: `Bearer ${await jwt()}` },
    });
    const rh = await app.request("https://gateway.test/rh", {
      headers: { authorization: `Bearer ${await jwt()}` },
    });
    const commercial = await app.request("https://gateway.test/commercial", {
      headers: { authorization: `Bearer ${await jwt()}` },
    });
    const triagem = await app.request("https://gateway.test/triagem/overview", {
      headers: { authorization: `Bearer ${await jwt()}` },
    });
    const pessoal = await app.request("https://gateway.test/pessoal", {
      headers: { authorization: `Bearer ${await jwt()}` },
    });
    const regularize = await app.request("https://gateway.test/regularize", {
      headers: { authorization: `Bearer ${await jwt()}` },
    });

    expect(project.status).toBe(200);
    expect(ti.status).toBe(200);
    expect(rh.status).toBe(200);
    expect(commercial.status).toBe(200);
    expect(triagem.status).toBe(200);
    expect(pessoal.status).toBe(200);
    expect(regularize.status).toBe(200);
    expect(projectBinding.fetch).toHaveBeenCalledOnce();
    expect(tiBinding.fetch).toHaveBeenCalledOnce();
    expect(rhBinding.fetch).toHaveBeenCalledOnce();
    expect(commercialBinding.fetch).toHaveBeenCalledOnce();
    expect(triagemBinding.fetch).toHaveBeenCalledOnce();
    expect(pessoalBinding.fetch).toHaveBeenCalledOnce();
    expect(regularizeBinding.fetch).toHaveBeenCalledOnce();
  });

  it("requires CSRF for cookie mutations", async () => {
    const binding = { fetch: vi.fn(async () => new Response(null, { status: 204 })) };
    const csrf = await createCsrfToken();
    const app = createGatewayWorkerApp({ env: env(binding) });
    const response = await app.request("https://gateway.test/department", {
      method: "POST",
      headers: { cookie: `cw.session=${await jwt(await hashCsrfToken(csrf))}` },
    });
    expect(response.status).toBe(403);
    expect(binding.fetch).not.toHaveBeenCalled();
  });
  describe("GET /dashboard/stats", () => {
    function dashboardDb() {
      const client = {
        connect: vi.fn(async () => undefined),
        end: vi.fn(async () => undefined),
        query: vi.fn(async () => ({ rows: [] })),
      };
      return client;
    }

    it("validates the session, reads the database scoped to the organization and closes it", async () => {
      const db = dashboardDb();
      const userService = { fetch: vi.fn(async () => new Response(null, { status: 200 })) };
      const app = createGatewayWorkerApp({
        env: env(undefined, {
          USER_SERVICE: userService,
          HYPERDRIVE: { connectionString: "postgresql://worker:test@db.example/giro" },
        }),
        dashboardDb: () => db as never,
      });

      const response = await app.request("https://gateway.test/dashboard/stats", {
        headers: { authorization: `Bearer ${await jwt()}` },
      });

      expect(response.status).toBe(200);
      const body = (await response.json()) as { data: { totalClients: number } };
      expect(body.data.totalClients).toBe(0);
      const validation = userService.fetch.mock.calls[0]?.[0] as Request;
      expect(new URL(validation.url).pathname).toBe("/user/session/validate");
      expect(validation.headers.get("x-internal-service-token")).toBe(TOKEN);
      expect(db.query).toHaveBeenCalled();
      for (const call of db.query.mock.calls as unknown as Array<[string, unknown[]]>) {
        expect(call[1]).toEqual(["org-1"]);
      }
      expect(db.end).toHaveBeenCalledTimes(1);
    });

    it("rejects a revoked session before touching the database", async () => {
      const db = dashboardDb();
      const app = createGatewayWorkerApp({
        env: env(undefined, {
          USER_SERVICE: { fetch: vi.fn(async () => new Response(null, { status: 401 })) },
          HYPERDRIVE: { connectionString: "postgresql://worker:test@db.example/giro" },
        }),
        dashboardDb: () => db as never,
      });

      const response = await app.request("https://gateway.test/dashboard/stats", {
        headers: { authorization: `Bearer ${await jwt()}` },
      });

      expect(response.status).toBe(401);
      expect(db.connect).not.toHaveBeenCalled();
    });

    it("answers 401 without credentials", async () => {
      const app = createGatewayWorkerApp({ env: env() });
      expect((await app.request("https://gateway.test/dashboard/stats")).status).toBe(401);
    });
  });
});
