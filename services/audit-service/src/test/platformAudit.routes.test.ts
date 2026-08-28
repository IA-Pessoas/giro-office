import {
  FORWARDED_AUTH_KIND_HEADER,
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_PERMISSION_HEADER,
  FORWARDED_AUTH_PLATFORM_ROLE_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
} from "@workspace/shared";
import { createLogger } from "@workspace/shared/logger";
import { MemoryLogStream } from "@workspace/shared/testUtils";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../app.js";
import type { AuditServiceEnv } from "../config/env.js";
import {
  type AuditRequestRepository,
  createAuditRequestRepository,
} from "../integrations/prisma/auditRequestRepository.js";
import { buildAuditServiceOpenApiSpec } from "../openapi/spec.js";
import { createAuditRequestService } from "../services/auditRequestService.js";

const env: AuditServiceEnv = {
  nodeEnv: "test",
  auditEnabled: true,
  auditServicePort: 3020,
  auditServiceToken: "audit-service-token",
  databaseUrl: "postgresql://localhost:5432/test",
  logLevel: "silent",
  logPretty: false,
  enableApiDocs: false,
};

function createTestLogger() {
  return createLogger({
    service: "audit-service-test",
    env: "test",
    level: "silent",
    destination: new MemoryLogStream(),
  });
}

function createRepository(): AuditRequestRepository {
  return {
    create: vi.fn(),
    search: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 }),
    searchPlatform: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 }),
    findByRequestId: vi.fn().mockResolvedValue(null),
  } satisfies AuditRequestRepository;
}

function platformHeaders(
  overrides: Partial<
    Record<
      "userId" | "authKind" | "platformRole" | "organizationId" | "internalToken" | "permission",
      string
    >
  > = {},
): Record<string, string> {
  return {
    [FORWARDED_AUTH_USER_ID_HEADER]: overrides.userId ?? "platform-user-1",
    [FORWARDED_AUTH_KIND_HEADER]: overrides.authKind ?? "platform",
    [FORWARDED_AUTH_PLATFORM_ROLE_HEADER]: overrides.platformRole ?? "super_admin",
    [INTERNAL_SERVICE_TOKEN_HEADER]: overrides.internalToken ?? env.auditServiceToken,
    ...(overrides.organizationId
      ? { [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: overrides.organizationId }
      : {}),
    ...(overrides.permission ? { [FORWARDED_AUTH_PERMISSION_HEADER]: overrides.permission } : {}),
  };
}

function organizationHeaders(organizationId = "org-1"): Record<string, string> {
  return {
    [FORWARDED_AUTH_USER_ID_HEADER]: "organization-user-1",
    [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: organizationId,
    [FORWARDED_AUTH_PERMISSION_HEADER]: "2",
    [FORWARDED_AUTH_KIND_HEADER]: "organization",
    [INTERNAL_SERVICE_TOKEN_HEADER]: env.auditServiceToken,
  };
}

describe("platform audit routes", () => {
  let repository: AuditRequestRepository;

  beforeEach(() => {
    repository = createRepository();
  });

  it("permite busca global somente ao super administrador da plataforma", async () => {
    const response = await request(createApp({ env, logger: createTestLogger(), repository }))
      .get("/audit/requests?page=1&pageSize=25")
      .set(platformHeaders());

    expect(response.status).toBe(200);
    expect(repository.search).not.toHaveBeenCalled();
    const searchPlatform = vi.mocked(repository.searchPlatform);
    expect(searchPlatform).toHaveBeenCalledOnce();
    const [filters] = searchPlatform.mock.calls[0];
    expect(filters).toMatchObject({ page: 1, pageSize: 25 });
    expect(filters).not.toHaveProperty("organizationId");
  });

  it("permite busca contextual da plataforma por organizationId UUID", async () => {
    const organizationId = "918eeaf9-82db-4e46-930b-b2d8b50b2776";

    const response = await request(createApp({ env, logger: createTestLogger(), repository }))
      .get(`/audit/requests?organizationId=${organizationId}`)
      .set(platformHeaders());

    expect(response.status).toBe(200);
    expect(repository.search).not.toHaveBeenCalled();
    expect(vi.mocked(repository.searchPlatform)).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId }),
    );
  });

  it.each([
    ["vazio", "organizationId="],
    ["invalido", "organizationId=not-a-uuid"],
    [
      "repetido",
      "organizationId=918eeaf9-82db-4e46-930b-b2d8b50b2776&organizationId=22c4d498-1801-4d0f-a167-7f542e7b9954",
    ],
  ])("rejeita organizationId de plataforma %s", async (_label, query) => {
    const response = await request(createApp({ env, logger: createTestLogger(), repository }))
      .get(`/audit/requests?${query}`)
      .set(platformHeaders());

    expect(response.status).toBe(400);
    expect(repository.search).not.toHaveBeenCalled();
    expect(repository.searchPlatform).not.toHaveBeenCalled();
  });

  it.each([
    ["organizationId", { organizationId: "forged-org" }],
    ["permission", { permission: "2" }],
    ["permission invalida", { permission: "not-a-number" }],
    ["organizationId e permission", { organizationId: "forged-org", permission: "2" }],
  ])("rejeita busca platform com header organizacional %s", async (_label, overrides) => {
    const response = await request(createApp({ env, logger: createTestLogger(), repository }))
      .get("/audit/requests")
      .set(platformHeaders(overrides));

    expect(response.status).toBe(403);
    expect(repository.search).not.toHaveBeenCalled();
  });

  it("mantem administradores organizacionais confinados ao tenant encaminhado", async () => {
    const response = await request(createApp({ env, logger: createTestLogger(), repository }))
      .get("/audit/requests?organizationId=918eeaf9-82db-4e46-930b-b2d8b50b2776")
      .set(organizationHeaders("org-2"));

    expect(response.status).toBe(200);
    expect(repository.search).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-2" }),
    );
    expect(repository.searchPlatform).not.toHaveBeenCalled();
  });

  it("ignora organizationId herdado na busca de plataforma", async () => {
    const query = Object.create({
      organizationId: "918eeaf9-82db-4e46-930b-b2d8b50b2776",
    }) as Record<string, unknown>;

    await createAuditRequestService(repository).searchPlatform(query);

    expect(repository.searchPlatform).toHaveBeenCalledWith(
      expect.not.objectContaining({ organizationId: expect.anything() }),
    );
  });

  it("ignora organizationId accessor sem executar getter", async () => {
    const getter = vi.fn(() => "918eeaf9-82db-4e46-930b-b2d8b50b2776");
    const query = {} as Record<string, unknown>;
    Object.defineProperty(query, "organizationId", { get: getter });

    await createAuditRequestService(repository).searchPlatform(query);

    expect(getter).not.toHaveBeenCalled();
    expect(repository.searchPlatform).toHaveBeenCalledWith(
      expect.not.objectContaining({ organizationId: expect.anything() }),
    );
  });

  it("rejeita headers de plataforma sem o token interno do gateway", async () => {
    const response = await request(createApp({ env, logger: createTestLogger(), repository }))
      .get("/audit/requests")
      .set(platformHeaders({ internalToken: "attacker-token" }));

    expect(response.status).toBe(401);
    expect(repository.search).not.toHaveBeenCalled();
  });

  it("rejeita identidade de plataforma sem o par exato platform/super_admin", async () => {
    const response = await request(createApp({ env, logger: createTestLogger(), repository }))
      .get("/audit/requests")
      .set(platformHeaders({ platformRole: "support" }));

    expect(response.status).toBe(401);
    expect(repository.search).not.toHaveBeenCalled();
  });

  it("nao permite que identidade organizacional omita o tenant", async () => {
    const headers = organizationHeaders();
    delete headers[FORWARDED_AUTH_ORGANIZATION_ID_HEADER];

    const response = await request(createApp({ env, logger: createTestLogger(), repository }))
      .get("/audit/requests")
      .set(headers);

    expect(response.status).toBe(401);
    expect(repository.search).not.toHaveBeenCalled();
  });

  it("nao abre uma rota direta /platform no audit-service", async () => {
    const response = await request(createApp({ env, logger: createTestLogger(), repository }))
      .get("/platform/audit/requests")
      .set(platformHeaders());

    expect(response.status).toBe(404);
    expect(repository.search).not.toHaveBeenCalled();
  });

  it("mantem o detalhe restrito a uma organizacao", async () => {
    const response = await request(createApp({ env, logger: createTestLogger(), repository }))
      .get("/audit/requests/req-1")
      .set(platformHeaders());

    expect(response.status).toBe(403);
    expect(repository.findByRequestId).not.toHaveBeenCalled();
  });

  it("nao aceita permissao organizacional injetada em identidade de plataforma", async () => {
    const response = await request(createApp({ env, logger: createTestLogger(), repository }))
      .get("/audit/requests/req-1")
      .set(platformHeaders({ organizationId: "forged-org", permission: "2" }));

    expect(response.status).toBe(403);
    expect(repository.findByRequestId).not.toHaveBeenCalled();
  });

  it("rejeita pagina cujo offset excede a janela administrativa", async () => {
    const response = await request(createApp({ env, logger: createTestLogger(), repository }))
      .get("/audit/requests?page=52&pageSize=200")
      .set(platformHeaders());

    expect(response.status).toBe(400);
    expect(repository.search).not.toHaveBeenCalled();
  });

  it("rejeita filtro textual acima do limite", async () => {
    const response = await request(createApp({ env, logger: createTestLogger(), repository }))
      .get(`/audit/requests?path=${"a".repeat(201)}`)
      .set(platformHeaders());

    expect(response.status).toBe(400);
    expect(repository.search).not.toHaveBeenCalled();
  });
});

describe("platform audit persistence", () => {
  it("limita o total global, anuncia ultima pagina acessivel e retorna DTO por allowlist", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "audit-1",
        request_id: "request-1",
        organization_id: "org-1",
        user_id: "sensitive-user",
        permission: 3,
        method: "GET",
        path: "/user",
        query_json: { token: "sensitive-query" },
        status_code: 200,
        outcome: "success",
        duration_ms: 12,
        ip: "127.0.0.1",
        user_agent: "sensitive-agent",
        origin: "sensitive-origin",
        error_code: null,
        error_message: "sensitive-error",
        service_source: "gateway",
        metadata_json: { secret: true },
        created_at: new Date("2026-08-24T12:00:00.000Z"),
        finished_at: new Date("2026-08-24T12:00:00.012Z"),
        action: "READ",
        referring: "user",
        referring_id: "user-1",
        changes_json: { password: "sensitive-change" },
        department: "Sensitive",
      },
    ]);
    const count = vi.fn().mockResolvedValue(50_000);
    const repository = createAuditRequestRepository({
      auditRequest: { findMany, count },
      $transaction: (operations: Array<Promise<unknown>>) => Promise.all(operations),
    } as never);

    const result = await repository.searchPlatform({ page: 401, pageSize: 25 });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {},
        orderBy: [{ created_at: "desc" }, { id: "desc" }],
        skip: 10_000,
        take: 25,
        select: {
          id: true,
          request_id: true,
          organization_id: true,
          method: true,
          path: true,
          status_code: true,
          outcome: true,
          duration_ms: true,
          service_source: true,
          created_at: true,
          metadata_json: true,
          action: true,
          referring: true,
          referring_id: true,
          changes_json: true,
        },
      }),
    );
    expect(count).toHaveBeenCalledWith({ where: {}, take: 10_025 });
    expect(result.total).toBe(10_025);
    expect((Math.ceil(result.total / result.pageSize) - 1) * result.pageSize).toBe(10_000);
    expect(result.items).toEqual([
      {
        id: "audit-1",
        requestId: "request-1",
        organizationId: "org-1",
        method: "GET",
        path: "/user",
        statusCode: 200,
        outcome: "success",
        durationMs: 12,
        serviceSource: "gateway",
        createdAt: "2026-08-24T12:00:00.000Z",
        action: "READ",
        referring: "user",
        referringId: "user-1",
      },
    ]);
  });

  it("projeta before/after modular allowlisted atribuído ao PlatformUser", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "permission-audit-1",
        request_id: "permission-request-1",
        organization_id: "org-1",
        method: "ENTITY_CHANGE",
        path: "/platform/organizations/org-1/users/user-1/permissions",
        status_code: 200,
        outcome: "success",
        duration_ms: 3,
        service_source: "user-service",
        created_at: new Date("2026-08-28T12:00:00.000Z"),
        metadata_json: { actorPlatformUserId: "platform-user-1", secret: "must-not-leak" },
        action: "platform.user.permissions.updated",
        referring: "user",
        referring_id: "user-1",
        changes_json: {
          modules: {
            before: { rh: 1, fiscal: 0, secret: 3 },
            after: { rh: 3, fiscal: 1, secret: 3 },
          },
        },
      },
    ]);
    const repository = createAuditRequestRepository({
      auditRequest: { findMany, count: vi.fn().mockResolvedValue(1) },
      $transaction: (operations: Array<Promise<unknown>>) => Promise.all(operations),
    } as never);

    const result = await repository.searchPlatform({ page: 1, pageSize: 25 });

    expect(result.items[0]).toMatchObject({
      actorPlatformUserId: "platform-user-1",
      changes: {
        modules: {
          before: { rh: 1, fiscal: 0 },
          after: { rh: 3, fiscal: 1 },
        },
      },
    });
    expect(JSON.stringify(result.items[0])).not.toContain("secret");
  });

  it("usa select seguro e total limitado na busca contextual da plataforma", async () => {
    const organizationId = "918eeaf9-82db-4e46-930b-b2d8b50b2776";
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "audit-2",
        request_id: "request-2",
        organization_id: organizationId,
        method: "ENTITY_CHANGE",
        path: "/internal/audit/requests",
        status_code: 201,
        outcome: "success",
        duration_ms: 3,
        service_source: "organization-service",
        created_at: new Date("2026-08-25T12:00:00.000Z"),
        metadata_json: {
          actorPlatformUserId: " platform-user-1 ",
          token: "must-not-leak",
        },
        action: "organization.status.updated",
        referring: "organization",
        referring_id: organizationId,
        changes_json: {
          status: { from: "trial", to: "active", secret: "must-not-leak" },
          subscription_plan: { from: "trial", to: "pro" },
          logo_url: { from: null, to: "https://cdn.example.com/logo.png" },
          password: { from: "old", to: "new" },
        },
      },
    ]);
    const count = vi.fn().mockResolvedValue(50_000);
    const repository = createAuditRequestRepository({
      auditRequest: { findMany, count },
      $transaction: (operations: Array<Promise<unknown>>) => Promise.all(operations),
    } as never);

    const result = await repository.searchPlatform({ organizationId, page: 1, pageSize: 25 });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organization_id: organizationId },
        select: expect.objectContaining({
          metadata_json: true,
          action: true,
          referring: true,
          referring_id: true,
          changes_json: true,
        }),
        orderBy: [{ created_at: "desc" }, { id: "desc" }],
      }),
    );
    expect(count).toHaveBeenCalledWith({
      where: { organization_id: organizationId },
      take: 10_025,
    });
    expect(result.total).toBe(10_025);
    expect(result.items[0]).toMatchObject({
      action: "organization.status.updated",
      referring: "organization",
      referringId: organizationId,
      actorPlatformUserId: "platform-user-1",
      changes: {
        status: { from: "trial", to: "active" },
        subscription_plan: { from: "trial", to: "pro" },
        logo_url: { from: null, to: "https://cdn.example.com/logo.png" },
      },
    });
    expect(result.items[0]?.changes).toEqual({
      status: { from: "trial", to: "active" },
      subscription_plan: { from: "trial", to: "pro" },
      logo_url: { from: null, to: "https://cdn.example.com/logo.png" },
    });
    expect(result.items[0]).not.toHaveProperty("metadata");
    expect(result.items[0]).not.toHaveProperty("metadata_json");
    expect(result.items[0]).not.toHaveProperty("changes_json");
  });

  it("omite ator e changes quando metadata ou evento organizacional nao passam na allowlist", async () => {
    const organizationId = "918eeaf9-82db-4e46-930b-b2d8b50b2776";
    const baseRow = {
      request_id: "request-invalid",
      organization_id: organizationId,
      method: "ENTITY_CHANGE",
      path: "/internal/audit/requests",
      status_code: 201,
      outcome: "success",
      duration_ms: 3,
      created_at: new Date("2026-08-25T12:00:00.000Z"),
      action: "organization.status.updated",
      referring: "organization",
      referring_id: organizationId,
    };
    const subscriptionPlanGetter = vi.fn(() => ({ from: "trial", to: "pro" }));
    const changesWithAccessor = {};
    Object.defineProperty(changesWithAccessor, "subscription_plan", {
      get: subscriptionPlanGetter,
    });
    const fromGetter = vi.fn(() => "trial");
    const statusWithAccessor = { to: "active" };
    Object.defineProperty(statusWithAccessor, "from", { get: fromGetter });
    const findMany = vi.fn().mockResolvedValue([
      {
        ...baseRow,
        id: "inherited-change-key",
        service_source: "organization-service",
        metadata_json: null,
        changes_json: Object.create({ status: { from: "trial", to: "active" } }),
      },
      {
        ...baseRow,
        id: "accessor-change-key",
        service_source: "organization-service",
        metadata_json: null,
        changes_json: changesWithAccessor,
      },
      {
        ...baseRow,
        id: "inherited-pair-values",
        service_source: "organization-service",
        metadata_json: null,
        changes_json: {
          logo_url: Object.create({ from: null, to: "https://cdn.example.com/logo.png" }),
        },
      },
      {
        ...baseRow,
        id: "accessor-pair-value",
        service_source: "organization-service",
        metadata_json: null,
        changes_json: { status: statusWithAccessor },
      },
      {
        ...baseRow,
        id: "wrong-service",
        service_source: "gateway",
        metadata_json: { nested: { actorPlatformUserId: "hidden" } },
        changes_json: { status: { from: "trial", to: "active" } },
      },
      {
        ...baseRow,
        id: "wrong-action",
        service_source: "organization-service",
        action: "organization.deleted",
        metadata_json: null,
        changes_json: { status: { from: "trial", to: "active" } },
      },
      {
        ...baseRow,
        id: "wrong-referring",
        service_source: "organization-service",
        referring: "user",
        metadata_json: null,
        changes_json: { status: { from: "trial", to: "active" } },
      },
      {
        ...baseRow,
        id: "wrong-referring-id",
        service_source: "organization-service",
        referring_id: "another-organization",
        metadata_json: { actorPlatformUserId: " ".repeat(3) },
        changes_json: { status: { from: "trial", to: "active" } },
      },
      {
        ...baseRow,
        id: "invalid-values",
        service_source: "organization-service",
        metadata_json: { actorPlatformUserId: "a".repeat(201) },
        changes_json: {
          status: { from: "unknown", to: "active" },
          subscription_plan: { from: "trial", to: "custom" },
          logo_url: { from: null, to: "https://user:password@example.com/logo.png" },
        },
      },
      {
        ...baseRow,
        id: "malformed-json",
        service_source: "organization-service",
        metadata_json: ["platform-user-1"],
        changes_json: "not-an-object",
      },
    ]);
    const repository = createAuditRequestRepository({
      auditRequest: { findMany, count: vi.fn().mockResolvedValue(4) },
      $transaction: (operations: Array<Promise<unknown>>) => Promise.all(operations),
    } as never);

    const result = await repository.searchPlatform({ organizationId, page: 1, pageSize: 25 });

    for (const item of result.items) {
      expect(item).not.toHaveProperty("actorPlatformUserId");
      expect(item).not.toHaveProperty("changes");
      expect(item).not.toHaveProperty("metadata");
    }
    expect(subscriptionPlanGetter).not.toHaveBeenCalled();
    expect(fromGetter).not.toHaveBeenCalled();
  });
});

describe("platform audit OpenAPI", () => {
  it("documenta paginacao limitada para a rota clonada pelo gateway", () => {
    const spec = buildAuditServiceOpenApiSpec(env);

    expect(spec.paths).toHaveProperty(["/audit/requests", "get", "parameters", 0, "schema"], {
      type: "integer",
      minimum: 1,
      maximum: 10_001,
      default: 1,
    });
    expect(spec.paths).toHaveProperty(["/audit/requests", "get", "parameters", 1, "schema"], {
      type: "integer",
      minimum: 1,
      maximum: 200,
      default: 50,
    });
  });

  it("documenta filtros, limites e respostas de erro da busca", () => {
    const spec = buildAuditServiceOpenApiSpec(env);
    const operation = (spec.paths["/audit/requests"] as { get: unknown }).get as {
      parameters: Array<{ name: string; in: string; schema: Record<string, unknown> }>;
      responses: Record<string, unknown>;
    };
    const parameters = Object.fromEntries(
      operation.parameters.map((parameter) => [parameter.name, parameter]),
    );

    for (const name of [
      "requestId",
      "userId",
      "method",
      "path",
      "referring",
      "referringId",
      "department",
    ]) {
      expect(parameters[name]).toMatchObject({
        in: "query",
        schema: { type: "string", maxLength: 200 },
      });
    }
    expect(parameters.statusCode).toMatchObject({
      in: "query",
      schema: { type: "integer" },
    });
    expect(parameters.dateFrom).toMatchObject({
      in: "query",
      schema: { type: "string", format: "date-time" },
    });
    expect(parameters.dateTo).toMatchObject({
      in: "query",
      schema: { type: "string", format: "date-time" },
    });
    expect(operation.responses).toEqual(
      expect.objectContaining({
        "400": expect.any(Object),
        "401": expect.any(Object),
        "403": expect.any(Object),
      }),
    );
  });

  it("documenta organizationId UUID opcional e a projecao segura de plataforma", () => {
    const spec = buildAuditServiceOpenApiSpec(env);
    const operation = (spec.paths["/audit/requests"] as { get: unknown }).get as {
      description?: string;
      parameters: Array<{
        name: string;
        in: string;
        required?: boolean;
        schema: Record<string, unknown>;
      }>;
    };

    expect(operation.parameters).toContainEqual(
      expect.objectContaining({
        name: "organizationId",
        in: "query",
        required: false,
        schema: { type: "string", format: "uuid" },
      }),
    );
    expect(operation.description).toContain("projeção segura");
  });
});
