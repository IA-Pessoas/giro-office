import {
  CSRF_HEADER_NAME,
  FORWARDED_AUTH_KIND_HEADER,
  FORWARDED_AUTH_PLATFORM_ROLE_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  hashCsrfToken,
  INTERNAL_SERVICE_TOKEN_HEADER,
  ServiceError,
} from "@workspace/shared";
import { createLogger } from "@workspace/shared/logger";
import { MemoryLogStream } from "@workspace/shared/testUtils";
import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const platformAuthMock = vi.hoisted(() => ({
  login: vi.fn(),
  validateSession: vi.fn(),
  refreshSession: vi.fn(),
  revokeSession: vi.fn(),
}));

const { testEnv } = vi.hoisted(() => ({
  testEnv: {
    port: 3030,
    databaseUrl: "postgresql://user:pass@localhost:5432/test",
    jwtSecret: "jwt-secret",
    adminPassword: "admin-password",
    nodeEnv: "test",
    logLevel: "silent",
    logPretty: false,
    auditEnabled: false,
    auditServiceUrl: "http://localhost:3020",
    enableApiDocs: false,
    authCookieSecure: true,
    auditServiceToken: "audit-service-token",
    reportsInternalToken: "reports-service-token",
    allowedOrigins: ["*"],
    uploadRateLimitMax: 30,
    uploadRateLimitWindowMs: 600_000,
    supabaseUrl: "http://localhost:54321",
    supabaseServiceRoleKey: "service-role-key",
  },
}));

vi.mock("../config/env.js", () => ({ getUserServiceEnv: () => testEnv }));

vi.mock("../services/platformAuthService.js", () => ({
  PlatformAuthService: vi.fn(function PlatformAuthService() {
    return platformAuthMock;
  }),
}));

import { createUserApp } from "../app.js";
import { getUserServiceEnv } from "../config/env.js";

const platformIdentity = {
  id: "platform-user-1",
  name: "Platform Administrator",
  email: "admin@example.com",
  auth_kind: "platform" as const,
  platform_role: "super_admin" as const,
};
const csrfToken = "A".repeat(43);

function createApp() {
  return createUserApp(
    getUserServiceEnv(),
    createLogger({
      service: "user-service-test",
      env: "test",
      level: "silent",
      destination: new MemoryLogStream(),
    }),
  );
}

function platformSessionToken(overrides: Record<string, unknown> = {}) {
  return jwt.sign(
    {
      user_id: "platform-user-1",
      auth_kind: "platform",
      platform_role: "super_admin",
      session_version: 1,
      session_id: "platform-session-1",
      csrf_hash: hashCsrfToken(csrfToken),
      name: platformIdentity.name,
      login: platformIdentity.email,
      ...overrides,
    },
    getUserServiceEnv().jwtSecret,
  );
}

function platformSessionHeaders(token = platformSessionToken()): Record<string, string> {
  return {
    Cookie: `cw.session=${token}; cw.csrf=${csrfToken}`,
    [CSRF_HEADER_NAME]: csrfToken,
    [INTERNAL_SERVICE_TOKEN_HEADER]: getUserServiceEnv().auditServiceToken,
    [FORWARDED_AUTH_USER_ID_HEADER]: platformIdentity.id,
    [FORWARDED_AUTH_KIND_HEADER]: "platform",
    [FORWARDED_AUTH_PLATFORM_ROLE_HEADER]: "super_admin",
  };
}

describe("platform auth routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    platformAuthMock.login.mockResolvedValue({
      identity: platformIdentity,
      token: "platform.jwt",
      csrfToken,
    });
    platformAuthMock.validateSession.mockResolvedValue(platformIdentity);
    platformAuthMock.refreshSession.mockResolvedValue({
      identity: platformIdentity,
      token: "refreshed.platform.jwt",
      csrfToken: "B".repeat(43),
    });
    platformAuthMock.revokeSession.mockResolvedValue(undefined);
  });

  it("sets HTTP-only cookies and omits credentials from JSON", async () => {
    const response = await request(createApp()).post("/platform/session").send({
      email: platformIdentity.email,
      password: "safe-password",
    });

    expect(response.status).toBe(200);
    expect(response.headers["set-cookie"][0]).toContain("cw.session=platform.jwt");
    expect(response.headers["set-cookie"][0]).toContain("HttpOnly");
    expect(response.headers["set-cookie"][0]).toContain("Secure");
    expect(response.headers["set-cookie"][0]).toContain("SameSite=Lax");
    expect(response.headers["set-cookie"][1]).toContain("cw.csrf=");
    expect(response.headers["set-cookie"][1]).not.toContain("HttpOnly");
    expect(response.body.data).toEqual(platformIdentity);
    expect(response.body.data).not.toHaveProperty("token");
    expect(response.body.data).not.toHaveProperty("csrfToken");
  });

  it("returns a generic 401 for invalid platform credentials", async () => {
    platformAuthMock.login.mockRejectedValue(new ServiceError(401, "Login ou senha inválidos."));

    const response = await request(createApp()).post("/platform/session").send({
      email: platformIdentity.email,
      password: "wrong-password",
    });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("Login ou senha inválidos.");
  });

  it("rejects an organizational identity", async () => {
    const response = await request(createApp())
      .get("/platform/me")
      .set(platformSessionHeaders(platformSessionToken({ auth_kind: "organization" })));

    expect(response.status).toBe(403);
    expect(response.body.error).toBe("Acesso negado.");
    expect(platformAuthMock.validateSession).not.toHaveBeenCalled();
  });

  it("rejeita cookie e identidade forjada sem o token interno do gateway", async () => {
    const headers = platformSessionHeaders();
    delete headers[INTERNAL_SERVICE_TOKEN_HEADER];

    const response = await request(createApp()).get("/platform/me").set(headers);

    expect(response.status).toBe(401);
    expect(platformAuthMock.validateSession).not.toHaveBeenCalled();
  });

  it("returns 409 when a concurrent refresh already rotated the session", async () => {
    platformAuthMock.refreshSession.mockRejectedValue(
      new ServiceError(409, "Sessão substituída por uma renovação mais recente."),
    );

    const response = await request(createApp())
      .post("/platform/session/refresh")
      .set(platformSessionHeaders());

    expect(response.status).toBe(409);
  });

  it("requires the CSRF proof before rotating a cookie session", async () => {
    const headers = platformSessionHeaders();
    delete headers[CSRF_HEADER_NAME];
    const response = await request(createApp()).post("/platform/session/refresh").set(headers);

    expect(response.status).toBe(403);
    expect(response.body.error).toBe("Requisição não autorizada.");
    expect(platformAuthMock.refreshSession).not.toHaveBeenCalled();
  });

  it("revokes the current session and expires both cookies", async () => {
    const response = await request(createApp())
      .delete("/platform/session")
      .set(platformSessionHeaders());

    expect(response.status).toBe(200);
    expect(platformAuthMock.revokeSession).toHaveBeenCalledWith(
      expect.objectContaining({ session_id: "platform-session-1" }),
    );
    expect(response.headers["set-cookie"]).toEqual(
      expect.arrayContaining([expect.stringContaining("cw.session=; Max-Age=0")]),
    );
  });

  it("validates an internal platform session only with a service token", async () => {
    const token = platformSessionToken();
    const allowed = await request(createApp())
      .post("/platform/session/validate")
      .set(INTERNAL_SERVICE_TOKEN_HEADER, getUserServiceEnv().auditServiceToken)
      .set("Authorization", `Bearer ${token}`);
    const denied = await request(createApp())
      .post("/platform/session/validate")
      .set("Authorization", `Bearer ${token}`);

    expect(allowed.status).toBe(200);
    expect(allowed.body.data).toEqual({ valid: true });
    expect(denied.status).toBe(403);
    expect(denied.body.error).toBe("Acesso negado.");
  });
});
