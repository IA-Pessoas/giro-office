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

const { platformAuthMock, platformUsersMock } = vi.hoisted(() => ({
  platformAuthMock: { validateSession: vi.fn() },
  platformUsersMock: {
    list: vi.fn(),
    getById: vi.fn(),
    listDepartments: vi.fn(),
    getPermissions: vi.fn(),
    updatePermissions: vi.fn(),
    create: vi.fn(),
    deactivate: vi.fn(),
    reactivate: vi.fn(),
  },
}));

const { testEnv } = vi.hoisted(() => ({
  testEnv: {
    port: 3030,
    databaseUrl: "postgresql://user:pass@localhost:5432/test",
    jwtSecret: "jwt-secret",
    adminPassword: "admin-password",
    nodeEnv: "test",
    logLevel: "silent" as const,
    logPretty: false,
    auditEnabled: false,
    auditServiceUrl: "http://localhost:3020",
    enableApiDocs: false,
    authCookieSecure: true,
    auditServiceToken: "audit-service-token",
    userServiceInternalToken: "user-service-internal-token",
    platformAuthRateLimitMax: 10,
    platformAuthRateLimitWindowMs: 60_000,
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
import { buildUserServiceOpenApiSpec } from "../openapi/spec.js";

const platformIdentity = {
  id: "platform-user-1",
  name: "Platform Administrator",
  email: "admin@example.com",
  auth_kind: "platform" as const,
  platform_role: "super_admin" as const,
};
const csrfToken = "A".repeat(43);

function platformSessionToken(): string {
  return jwt.sign(
    {
      user_id: platformIdentity.id,
      auth_kind: "platform",
      platform_role: "super_admin",
      session_version: 1,
      session_id: "platform-session-1",
      csrf_hash: hashCsrfToken(csrfToken),
    },
    getUserServiceEnv().jwtSecret,
  );
}

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

function platformGatewayHeaders(
  overrides: Partial<Record<"userId" | "authKind" | "platformRole" | "internalToken", string>> = {},
): Record<string, string> {
  return {
    Cookie: `cw.session=${platformSessionToken()}; cw.csrf=${csrfToken}`,
    [CSRF_HEADER_NAME]: csrfToken,
    [FORWARDED_AUTH_USER_ID_HEADER]: overrides.userId ?? platformIdentity.id,
    [FORWARDED_AUTH_KIND_HEADER]: overrides.authKind ?? "platform",
    [FORWARDED_AUTH_PLATFORM_ROLE_HEADER]: overrides.platformRole ?? "super_admin",
    [INTERNAL_SERVICE_TOKEN_HEADER]:
      overrides.internalToken ?? getUserServiceEnv().userServiceInternalToken,
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
    platformUsersMock.getById.mockResolvedValue({ id: "user-1", name: "Ana" });
    platformUsersMock.listDepartments.mockResolvedValue([{ id: "dep-1", name: "Fiscal" }]);
    platformUsersMock.getPermissions.mockResolvedValue({ rh: 2, fiscal: 1 });
    platformUsersMock.updatePermissions.mockResolvedValue({ rh: 3, fiscal: 1 });
    platformUsersMock.create.mockResolvedValue({ id: "user-2", name: "Nova", login: "nova" });
  });

  it("lists only the organization requested by a platform super admin", async () => {
    const response = await request(createApp())
      .get("/platform/organizations/org-2/users?skip=5&take=20&search=ana")
      .set(platformGatewayHeaders());

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

  it("reads details and department options only within the requested tenant", async () => {
    const app = createApp();
    const headers = platformGatewayHeaders();

    const [detail, departments] = await Promise.all([
      request(app).get("/platform/organizations/org-2/users/user-1").set(headers),
      request(app).get("/platform/organizations/org-2/departments").set(headers),
    ]);

    expect(detail.status).toBe(200);
    expect(departments.status).toBe(200);
    expect(platformUsersMock.getById).toHaveBeenCalledWith("org-2", "user-1");
    expect(platformUsersMock.listDepartments).toHaveBeenCalledWith("org-2");
  });

  it("lê permissões somente para o usuário da organização selecionada", async () => {
    const response = await request(createApp())
      .get("/platform/organizations/org-2/users/user-1/permissions")
      .set(platformGatewayHeaders());

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ rh: 2, fiscal: 1 });
    expect(platformUsersMock.getPermissions).toHaveBeenCalledWith(
      "org-2",
      "user-1",
      platformIdentity.id,
    );
  });

  it("salva permissões válidas com CSRF e rejeita níveis incompatíveis com 422", async () => {
    const app = createApp();
    const headers = platformGatewayHeaders();

    const updated = await request(app)
      .put("/platform/organizations/org-2/users/user-1/permissions")
      .set(headers)
      .send({ rh: 3, fiscal: 1 });
    const invalid = await request(app)
      .put("/platform/organizations/org-2/users/user-1/permissions")
      .set(headers)
      .send({ rh: 4 });

    expect(updated.status).toBe(200);
    expect(updated.body.data).toEqual({ rh: 3, fiscal: 1 });
    expect(platformUsersMock.updatePermissions).toHaveBeenCalledWith(
      "org-2",
      "user-1",
      { rh: 3, fiscal: 1 },
      platformIdentity.id,
    );
    expect(invalid.status).toBe(422);
    expect(platformUsersMock.updatePermissions).toHaveBeenCalledTimes(1);
  });

  it("cria usuário no tenant do path com sessão de plataforma e CSRF", async () => {
    const response = await request(createApp())
      .post("/platform/organizations/org-2/users")
      .set(platformGatewayHeaders())
      .send({
        name: "Nova",
        login: "nova",
        password: "senha-normal",
        department_id: "dep-2",
        permission: 1,
        organization_id: "org-forjada",
        type: "admin",
        modules: { rh: 1 },
      });

    expect(response.status).toBe(201);
    expect(response.body.data).toEqual({ id: "user-2", name: "Nova", login: "nova" });
    expect(platformUsersMock.create).toHaveBeenCalledWith(
      "org-2",
      expect.objectContaining({
        name: "Nova",
        organization_id: "org-forjada",
      }),
      platformIdentity.id,
    );
  });

  it("rejeita criação sem CSRF antes de chamar o serviço", async () => {
    const headers = platformGatewayHeaders();
    delete headers[CSRF_HEADER_NAME];
    const response = await request(createApp())
      .post("/platform/organizations/org-2/users")
      .set(headers)
      .send({});

    expect(response.status).toBe(403);
    expect(platformUsersMock.create).not.toHaveBeenCalled();
  });

  it("rejeita payload de criação inválido", async () => {
    const response = await request(createApp())
      .post("/platform/organizations/org-2/users")
      .set(platformGatewayHeaders())
      .send({ name: "Nova" });

    expect(response.status).toBe(400);
    expect(platformUsersMock.create).not.toHaveBeenCalled();
  });

  it("deactivates only the selected tenant user after platform session and CSRF validation", async () => {
    const response = await request(createApp())
      .delete("/platform/organizations/org-2/users/user-1")
      .set(platformGatewayHeaders());

    expect(response.status).toBe(200);
    expect(platformUsersMock.deactivate).toHaveBeenCalledWith("org-2", "user-1");
  });

  it("reactivates only future sessions after platform session and CSRF validation", async () => {
    platformUsersMock.reactivate.mockResolvedValue({ id: "user-1", status: "active" });

    const response = await request(createApp())
      .post("/platform/organizations/org-2/users/user-1/reactivate")
      .set(platformGatewayHeaders());

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ id: "user-1", status: "active" });
    expect(platformUsersMock.reactivate).toHaveBeenCalledWith("org-2", "user-1");
  });

  it("rejects a lifecycle mutation without CSRF before reaching the platform service", async () => {
    const headers = platformGatewayHeaders();
    delete headers[CSRF_HEADER_NAME];

    const response = await request(createApp())
      .delete("/platform/organizations/org-2/users/user-1")
      .set(headers);

    expect(response.status).toBe(403);
    expect(platformUsersMock.deactivate).not.toHaveBeenCalled();
  });

  it("returns the last-owner transfer conflict from the common user lifecycle", async () => {
    platformUsersMock.deactivate.mockRejectedValue(
      new ServiceError(
        409,
        "Nao e possivel remover o ultimo owner ativo. Use a transferencia de ownership.",
      ),
    );

    const response = await request(createApp())
      .delete("/platform/organizations/org-2/users/user-1")
      .set(platformGatewayHeaders());

    expect(response.status).toBe(409);
    expect(response.body.error).toContain("transferencia de ownership");
  });

  it("returns 403 for an organizational identity", async () => {
    const response = await request(createApp())
      .get("/platform/organizations/org-2/users")
      .set(platformGatewayHeaders({ authKind: "organization", platformRole: "" }));

    expect(response.status).toBe(403);
    expect(platformUsersMock.list).not.toHaveBeenCalled();
  });

  it("rejeita headers de plataforma forjados sem o token interno do gateway", async () => {
    const response = await request(createApp())
      .get("/platform/organizations/org-2/users")
      .set(platformGatewayHeaders({ internalToken: "attacker-token" }));

    expect(response.status).toBe(401);
    expect(platformUsersMock.list).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid page size", async () => {
    const response = await request(createApp())
      .get("/platform/organizations/org-2/users?take=101")
      .set(platformGatewayHeaders());

    expect(response.status).toBe(400);
    expect(platformUsersMock.list).not.toHaveBeenCalled();
  });

  it("returns 400 when skip exceeds the bounded administrative window", async () => {
    const response = await request(createApp())
      .get("/platform/organizations/org-2/users?skip=10001")
      .set(platformGatewayHeaders());

    expect(response.status).toBe(400);
    expect(platformUsersMock.list).not.toHaveBeenCalled();
  });
});

describe("platform users OpenAPI", () => {
  it("documents the bounded administrative skip window", () => {
    const spec = buildUserServiceOpenApiSpec(testEnv);

    expect(spec.paths).toHaveProperty(
      ["/platform/organizations/{organizationId}/users", "get", "parameters", 1, "schema"],
      { type: "integer", minimum: 0, maximum: 10_000, default: 0 },
    );
  });

  it("documents the secure deactivate and reactivate lifecycle contracts", () => {
    const spec = buildUserServiceOpenApiSpec(testEnv);

    expect(spec.paths).toHaveProperty([
      "/platform/organizations/{organizationId}/users/{userId}",
      "delete",
    ]);
    expect(spec.paths).toHaveProperty([
      "/platform/organizations/{organizationId}/users/{userId}/reactivate",
      "post",
    ]);
  });

  it("documents the shared modular permissions contract with CSRF and 422 validation", () => {
    const spec = buildUserServiceOpenApiSpec(testEnv);

    expect(spec.paths).toHaveProperty([
      "/platform/organizations/{organizationId}/users/{userId}/permissions",
      "get",
    ]);
    expect(spec.paths).toHaveProperty([
      "/platform/organizations/{organizationId}/users/{userId}/permissions",
      "put",
    ]);
    expect(spec).toHaveProperty(
      [
        "paths",
        "/platform/organizations/{organizationId}/users/{userId}/permissions",
        "put",
        "parameters",
      ],
      expect.arrayContaining([expect.objectContaining({ name: "x-csrf-token", required: true })]),
    );
    expect(spec).toHaveProperty([
      "paths",
      "/platform/organizations/{organizationId}/users/{userId}/permissions",
      "put",
      "responses",
      "422",
    ]);
  });

  it("documents the gateway-only token on direct platform routes", () => {
    const spec = buildUserServiceOpenApiSpec(testEnv);

    expect(spec).toHaveProperty(
      ["components", "securitySchemes", "gatewayInternalToken"],
      expect.objectContaining({
        type: "apiKey",
        in: "header",
        name: INTERNAL_SERVICE_TOKEN_HEADER,
        description: expect.stringContaining("USER_SERVICE_INTERNAL_TOKEN"),
      }),
    );
    expect(spec).toHaveProperty(
      ["paths", "/platform/session", "post", "security"],
      [{ gatewayInternalToken: [] }],
    );
    expect(spec).toHaveProperty(
      ["paths", "/platform/me", "get", "security"],
      [{ cookieAuth: [], gatewayInternalToken: [] }],
    );
  });
});
