import { hashCsrfToken } from "@workspace/shared";
import { createLogger } from "@workspace/shared/logger";
import { MemoryLogStream } from "@workspace/shared/testUtils";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { organizationServiceMock, prismaMock, verifyJwtTokenMock } = vi.hoisted(() => ({
  organizationServiceMock: { list: vi.fn(), listPlatform: vi.fn() },
  prismaMock: {
    platformAuthSession: { findFirst: vi.fn() },
  },
  verifyJwtTokenMock: vi.fn(),
}));

vi.mock("@workspace/shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@workspace/shared")>()),
  verifyJwtToken: verifyJwtTokenMock,
}));

vi.mock("../integrations/prisma.js", () => ({
  prismaClient: prismaMock,
}));

vi.mock("../services/organizationService.js", () => ({
  OrganizationService: vi.fn(function OrganizationService() {
    return organizationServiceMock;
  }),
}));

import { createOrganizationApp } from "../app.js";
import type { OrganizationEnv } from "../config/env.js";
import { buildOrganizationServiceOpenApiSpec } from "../openapi/spec.js";

const env = {
  port: 3031,
  databaseUrl: "postgresql://localhost/organization_test",
  jwtSecret: "test-jwt-secret-for-organization-service-min-32",
  nodeEnv: "test",
  logLevel: "silent",
  logPretty: false,
  allowedOrigins: ["*"],
  enableApiDocs: false,
} satisfies OrganizationEnv;
const csrfToken = "A".repeat(43);
const platformSession = {
  csrf_hash: hashCsrfToken(csrfToken),
  platformUser: {
    id: "platform-user-1",
    name: "Platform Administrator",
    email: "admin@example.com",
    platform_role: "super_admin",
    status: "active",
    session_version: 1,
  },
};

function createApp() {
  return createOrganizationApp(
    env,
    createLogger({
      service: "organization-service-test",
      env: "test",
      level: "silent",
      destination: new MemoryLogStream(),
    }),
  );
}

function platformHeaders(overrides: Record<string, unknown> = {}): Record<string, string> {
  verifyJwtTokenMock.mockReturnValue({
    user_id: "platform-user-1",
    auth_kind: "platform",
    platform_role: "super_admin",
    session_version: 1,
    session_id: "platform-session-1",
    csrf_hash: hashCsrfToken(csrfToken),
    ...overrides,
  });
  return { Cookie: `cw.session=platform-session; cw.csrf=${csrfToken}` };
}

describe("platform organization routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.platformAuthSession.findFirst.mockResolvedValue(platformSession);
    organizationServiceMock.listPlatform.mockResolvedValue({
      organizations: [{ id: "org-1", name: "Castelo", status: "active" }],
      total: 1,
      page: 2,
      pageSize: 20,
    });
  });

  it("lista organizações somente para a sessão HTTP-only de super administrador", async () => {
    const response = await request(createApp())
      .get("/platform/organizations?page=2&pageSize=20&status=active&search=castelo")
      .set(platformHeaders());

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      organizations: [{ id: "org-1", name: "Castelo", status: "active" }],
      total: 1,
      page: 2,
      pageSize: 20,
    });
    expect(organizationServiceMock.listPlatform).toHaveBeenCalledWith({
      page: 2,
      pageSize: 20,
      status: "active",
      search: "castelo",
    });
  });

  it("rejeita ausência de sessão de plataforma", async () => {
    const response = await request(createApp()).get("/platform/organizations");

    expect(response.status).toBe(401);
    expect(organizationServiceMock.listPlatform).not.toHaveBeenCalled();
  });

  it("rejeita uma identidade organizacional", async () => {
    const response = await request(createApp())
      .get("/platform/organizations")
      .set(platformHeaders({ auth_kind: "organization" }));

    expect(response.status).toBe(403);
    expect(organizationServiceMock.listPlatform).not.toHaveBeenCalled();
  });

  it("rejeita uma página cujo offset excede a janela administrativa", async () => {
    const response = await request(createApp())
      .get("/platform/organizations?page=502&pageSize=20")
      .set(platformHeaders());

    expect(response.status).toBe(400);
    expect(organizationServiceMock.listPlatform).not.toHaveBeenCalled();
  });

  it.each([
    ["revogada", null],
    ["expirada", null],
    [
      "inativa",
      { ...platformSession, platformUser: { ...platformSession.platformUser, status: "inactive" } },
    ],
    [
      "com versão divergente",
      { ...platformSession, platformUser: { ...platformSession.platformUser, session_version: 2 } },
    ],
    [{ csrf: "divergente" }, { ...platformSession, csrf_hash: "b".repeat(64) }],
  ])("rejeita sessão persistida %o", async (_label, session) => {
    prismaMock.platformAuthSession.findFirst.mockResolvedValue(session);

    const response = await request(createApp())
      .get("/platform/organizations")
      .set(platformHeaders());

    expect(response.status).toBe(401);
    expect(organizationServiceMock.listPlatform).not.toHaveBeenCalled();
  });
});

describe("platform organization OpenAPI", () => {
  it("documenta a paginação limitada por offset", () => {
    const spec = buildOrganizationServiceOpenApiSpec(env);

    expect(spec.paths).toHaveProperty(
      ["/platform/organizations", "get", "parameters", 0, "schema"],
      { type: "integer", minimum: 1, maximum: 10_001, default: 1 },
    );
    expect(spec.paths).toHaveProperty(
      ["/platform/organizations", "get", "parameters", 2, "schema"],
      { type: "string", enum: ["trial", "past_due", "active", "suspended", "cancelled"] },
    );
  });
});
