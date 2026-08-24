import { CSRF_HEADER_NAME, hashCsrfToken } from "@workspace/shared";
import { createLogger } from "@workspace/shared/logger";
import { MemoryLogStream } from "@workspace/shared/testUtils";
import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { platformAuthMock, platformUsersMock } = vi.hoisted(() => ({
  platformAuthMock: { validateSession: vi.fn() },
  platformUsersMock: { list: vi.fn() },
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
vi.mock("../services/platformUsersService.js", () => ({
  PlatformUsersService: vi.fn(function PlatformUsersService() {
    return platformUsersMock;
  }),
}));

import { createUserApp } from "../app.js";
import { getUserServiceEnv } from "../config/env.js";

const csrfToken = "A".repeat(43);
const platformIdentity = {
  id: "platform-user-1",
  name: "Platform Administrator",
  email: "admin@example.com",
  auth_kind: "platform" as const,
  platform_role: "super_admin" as const,
};

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
      user_id: platformIdentity.id,
      auth_kind: "platform",
      platform_role: "super_admin",
      session_version: 1,
      session_id: "platform-session-1",
      csrf_hash: hashCsrfToken(csrfToken),
      ...overrides,
    },
    getUserServiceEnv().jwtSecret,
  );
}

function platformSessionHeaders(token = platformSessionToken()): Record<string, string> {
  return {
    Cookie: `cw.session=${token}; cw.csrf=${csrfToken}`,
    [CSRF_HEADER_NAME]: csrfToken,
  };
}

describe("platform users routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    platformAuthMock.validateSession.mockResolvedValue(platformIdentity);
    platformUsersMock.list.mockResolvedValue({
      users: [{ id: "user-1", name: "Ana", login: "ana@example.com", status: "active" }],
      total: 1,
      hasMore: false,
    });
  });

  it("lists only the organization requested by a platform super admin", async () => {
    const response = await request(createApp())
      .get("/platform/organizations/org-2/users?skip=5&take=20&search=ana")
      .set(platformSessionHeaders());

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      users: [{ id: "user-1", name: "Ana", login: "ana@example.com", status: "active" }],
      total: 1,
      hasMore: false,
    });
    expect(platformUsersMock.list).toHaveBeenCalledWith({
      organizationId: "org-2",
      skip: 5,
      take: 20,
      search: "ana",
    });
  });

  it("returns 401 without a platform session", async () => {
    const response = await request(createApp()).get("/platform/organizations/org-2/users");

    expect(response.status).toBe(401);
    expect(platformUsersMock.list).not.toHaveBeenCalled();
  });

  it("returns 403 for an organizational identity", async () => {
    const response = await request(createApp())
      .get("/platform/organizations/org-2/users")
      .set(platformSessionHeaders(platformSessionToken({ auth_kind: "organization" })));

    expect(response.status).toBe(403);
    expect(platformUsersMock.list).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid page size", async () => {
    const response = await request(createApp())
      .get("/platform/organizations/org-2/users?take=101")
      .set(platformSessionHeaders());

    expect(response.status).toBe(400);
    expect(platformUsersMock.list).not.toHaveBeenCalled();
  });

  it("returns 400 when skip exceeds the bounded administrative window", async () => {
    const response = await request(createApp())
      .get("/platform/organizations/org-2/users?skip=10001")
      .set(platformSessionHeaders());

    expect(response.status).toBe(400);
    expect(platformUsersMock.list).not.toHaveBeenCalled();
  });
});
